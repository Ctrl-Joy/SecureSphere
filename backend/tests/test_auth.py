from datetime import timedelta

from sqlalchemy import func, select

from app.core.database import SessionLocal, utcnow
from app.core.security import verify_password
from app.models import AuditEvent, User, UserSession
from tests.conftest import PASSWORD, ApiClient, create_user

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"


def _register(client: ApiClient, email: str = "new@example.com", password: str = PASSWORD, **extra):  # type: ignore[no-untyped-def]
    body = {"name": "New Person", "email": email, "password": password, "accept_terms": True}
    body.update(extra)
    return client.send_json("POST", REGISTER, body)


class TestRegistration:
    def test_register_stores_argon2id_hash_and_normalized_email(self, client: ApiClient) -> None:
        res = _register(client, email="  New.Person@Example.COM ".strip())
        assert res.status_code == 202
        with SessionLocal() as db:
            user = db.scalar(select(User))
            assert user is not None
            assert user.email == "new.person@example.com"
            assert user.password_hash.startswith("$argon2id$")
            assert PASSWORD not in user.password_hash
            assert verify_password(user.password_hash, PASSWORD)
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(AuditEvent)
                    .where(AuditEvent.event_type == "auth.register")
                )
                == 1
            )

    def test_duplicate_email_gets_identical_response(self, client: ApiClient, alice: User) -> None:
        fresh = _register(client, email="someone-new@example.com")
        dup = _register(client, email=alice.email.upper())
        assert dup.status_code == fresh.status_code == 202
        assert dup.json() == fresh.json()
        with SessionLocal() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 2

    def test_weak_password_rejected_server_side(self, client: ApiClient) -> None:
        for weak in ["short", "password1234", "aaaaaaaaaaaaaaaa", "newperson-secret-1"]:
            res = _register(client, email="weak@example.com", password=weak)
            assert res.status_code == 422, weak
            assert res.json()["error"]["fields"][0]["field"] == "password"

    def test_terms_must_be_accepted(self, client: ApiClient) -> None:
        assert _register(client, accept_terms=False).status_code == 422

    def test_unknown_fields_rejected_mass_assignment(self, client: ApiClient) -> None:
        res = _register(client, role="admin")
        assert res.status_code == 422
        with SessionLocal() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 0

    def test_invalid_email_rejected(self, client: ApiClient) -> None:
        assert _register(client, email="not-an-email").status_code == 422

    def test_validation_errors_do_not_echo_input(self, client: ApiClient) -> None:
        res = client.send_json("POST", LOGIN, {"email": "x", "password": "s3cret-value-xyz"})
        assert res.status_code == 422
        assert "s3cret-value-xyz" not in res.text


class TestLogin:
    def test_login_sets_hardened_cookie(self, client: ApiClient, alice: User) -> None:
        res = client.login(alice.email)
        assert res.status_code == 200
        cookie = res.headers["set-cookie"].lower()
        assert "ss_session=" in cookie
        assert "httponly" in cookie
        assert "samesite=lax" in cookie
        assert res.json()["user"]["email"] == alice.email
        assert "password_hash" not in res.text

    def test_session_token_stored_only_as_hash(self, client: ApiClient, alice: User) -> None:
        client.login(alice.email)
        token = client.cookies.get("ss_session")
        with SessionLocal() as db:
            stored = db.scalar(select(UserSession.token_hash))
        assert token and stored and token not in stored and len(stored) == 64

    def test_wrong_password_and_unknown_user_are_indistinguishable(
        self, client: ApiClient, alice: User
    ) -> None:
        bad_pw = client.login(alice.email, "wrong-password-123")
        no_user = client.login("ghost@example.com", "wrong-password-123")
        assert bad_pw.status_code == no_user.status_code == 401
        assert bad_pw.json()["error"]["message"] == no_user.json()["error"]["message"]
        assert bad_pw.json()["error"]["code"] == no_user.json()["error"]["code"]

    def test_failed_and_successful_logins_are_audited(self, client: ApiClient, alice: User) -> None:
        client.login(alice.email, "wrong-password-123")
        client.login(alice.email)
        with SessionLocal() as db:
            types = set(db.scalars(select(AuditEvent.event_type)))
        assert {"auth.login.failure", "auth.login.success"} <= types

    def test_account_lockout_after_repeated_failures(self, client: ApiClient, alice: User) -> None:
        for _ in range(5):
            assert client.login(alice.email, "wrong-password-123").status_code == 401
        # Correct password is refused while locked, with the same generic message.
        res = client.login(alice.email)
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "invalid_credentials"
        with SessionLocal() as db:
            assert db.scalar(select(AuditEvent).where(AuditEvent.event_type == "auth.lockout"))

    def test_suspended_user_cannot_login(self, client: ApiClient) -> None:
        user = create_user("sus@example.com")
        with SessionLocal() as db:
            db.get(User, user.id).status = "suspended"  # type: ignore[union-attr]
            db.commit()
        assert client.login(user.email).status_code == 401

    def test_login_rotates_existing_session(self, client: ApiClient, alice: User) -> None:
        client.login(alice.email)
        first = client.cookies.get("ss_session")
        client.login(alice.email)
        second = client.cookies.get("ss_session")
        assert first != second
        with SessionLocal() as db:
            live = db.scalar(
                select(func.count())
                .select_from(UserSession)
                .where(UserSession.revoked_at.is_(None))
            )
        assert live == 1


class TestSessions:
    def test_protected_route_requires_session(self, client: ApiClient) -> None:
        res = client.get("/api/v1/auth/me")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "unauthenticated"

    def test_logout_invalidates_session_server_side(self, alice_client: ApiClient) -> None:
        token = alice_client.cookies.get("ss_session")
        assert alice_client.send_json("POST", "/api/v1/auth/logout").status_code == 204
        # Replaying the old cookie must fail even though the client still has it.
        alice_client.cookies.set("ss_session", token or "")
        assert alice_client.get("/api/v1/auth/me").status_code == 401

    def test_idle_timeout(self, alice_client: ApiClient) -> None:
        with SessionLocal() as db:
            s = db.scalar(select(UserSession))
            s.last_seen_at = utcnow() - timedelta(minutes=31)  # type: ignore[union-attr]
            db.commit()
        assert alice_client.get("/api/v1/auth/me").status_code == 401

    def test_absolute_timeout(self, alice_client: ApiClient) -> None:
        with SessionLocal() as db:
            s = db.scalar(select(UserSession))
            s.expires_at = utcnow() - timedelta(seconds=1)  # type: ignore[union-attr]
            db.commit()
        assert alice_client.get("/api/v1/auth/me").status_code == 401

    def test_list_and_revoke_other_session(self, make_client, alice: User) -> None:  # type: ignore[no-untyped-def]
        laptop, phone = make_client(), make_client()
        laptop.login(alice.email)
        phone.login(alice.email)
        sessions = laptop.get("/api/v1/sessions").json()
        assert len(sessions) == 2
        other = next(s for s in sessions if not s["current"])
        assert laptop.send_json("DELETE", f"/api/v1/sessions/{other['id']}").status_code == 200
        assert phone.get("/api/v1/auth/me").status_code == 401
        assert laptop.get("/api/v1/auth/me").status_code == 200

    def test_revoke_all_other_sessions(self, make_client, alice: User) -> None:  # type: ignore[no-untyped-def]
        a, b, c = make_client(), make_client(), make_client()
        for cl in (a, b, c):
            cl.login(alice.email)
        assert a.send_json("DELETE", "/api/v1/sessions").status_code == 200
        assert a.get("/api/v1/auth/me").status_code == 200
        assert b.get("/api/v1/auth/me").status_code == 401
        assert c.get("/api/v1/auth/me").status_code == 401

    def test_suspension_ends_live_sessions(self, alice_client: ApiClient, alice: User) -> None:
        with SessionLocal() as db:
            db.get(User, alice.id).status = "suspended"  # type: ignore[union-attr]
            db.commit()
        assert alice_client.get("/api/v1/auth/me").status_code == 401
