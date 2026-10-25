import re
from datetime import timedelta
from email import message_from_string, policy

from sqlalchemy import select

from app.core.database import SessionLocal, utcnow
from app.models import AuditEvent, PasswordResetToken
from tests.conftest import MAIL_DIR, OTHER_PASSWORD, PASSWORD, ApiClient

CHANGE = "/api/v1/auth/change-password"
RESET_REQ = "/api/v1/auth/password-reset/request"
RESET_CONFIRM = "/api/v1/auth/password-reset/confirm"


def _latest_reset_token() -> str:
    mails = sorted(MAIL_DIR.glob("*.eml"))
    assert mails, "no reset email written to dev outbox"
    msg = message_from_string(mails[-1].read_text(encoding="utf-8"), policy=policy.default)
    body = msg.get_body().get_content()  # type: ignore[union-attr]
    match = re.search(r"#token=([A-Za-z0-9_\-]+)", body)
    assert match
    return match.group(1)


class TestChangePassword:
    def test_requires_current_password(self, alice_client: ApiClient) -> None:
        res = alice_client.send_json(
            "POST", CHANGE, {"current_password": "nope-wrong-123", "new_password": OTHER_PASSWORD}
        )
        assert res.status_code == 400
        assert res.json()["error"]["fields"][0]["field"] == "current_password"

    def test_change_rotates_and_revokes_sessions(self, make_client, alice) -> None:  # type: ignore[no-untyped-def]
        main, other = make_client(), make_client()
        main.login(alice.email)
        other.login(alice.email)
        old_cookie = main.cookies.get("ss_session")
        res = main.send_json(
            "POST", CHANGE, {"current_password": PASSWORD, "new_password": OTHER_PASSWORD}
        )
        assert res.status_code == 200
        main.csrf = res.json()["csrf_token"]
        assert main.cookies.get("ss_session") != old_cookie
        assert main.get("/api/v1/auth/me").status_code == 200
        assert other.get("/api/v1/auth/me").status_code == 401
        # New password works, old one does not.
        fresh = make_client()
        assert fresh.login(alice.email, PASSWORD).status_code == 401
        assert fresh.login(alice.email, OTHER_PASSWORD).status_code == 200

    def test_policy_enforced(self, alice_client: ApiClient) -> None:
        res = alice_client.send_json(
            "POST", CHANGE, {"current_password": PASSWORD, "new_password": "password1234"}
        )
        assert res.status_code == 422


class TestPasswordReset:
    def test_request_is_generic_for_unknown_accounts(self, client: ApiClient, alice) -> None:  # type: ignore[no-untyped-def]
        known = client.send_json("POST", RESET_REQ, {"email": alice.email})
        unknown = client.send_json("POST", RESET_REQ, {"email": "nobody@example.com"})
        assert known.status_code == unknown.status_code == 202
        assert known.json() == unknown.json()
        assert len(list(MAIL_DIR.glob("*.eml"))) == 1

    def test_token_stored_hashed_and_single_use(self, client: ApiClient, alice) -> None:  # type: ignore[no-untyped-def]
        client.send_json("POST", RESET_REQ, {"email": alice.email})
        token = _latest_reset_token()
        with SessionLocal() as db:
            stored = db.scalar(select(PasswordResetToken.token_hash))
        assert stored and token not in stored

        ok = client.send_json(
            "POST", RESET_CONFIRM, {"token": token, "new_password": OTHER_PASSWORD}
        )
        assert ok.status_code == 200
        client.refresh_csrf()  # a completed reset clears all auth cookies
        again = client.send_json(
            "POST", RESET_CONFIRM, {"token": token, "new_password": "yet-another Pass 99"}
        )
        assert again.status_code == 400
        assert client.login(alice.email, OTHER_PASSWORD).status_code == 200

    def test_expired_token_rejected(self, client: ApiClient, alice) -> None:  # type: ignore[no-untyped-def]
        client.send_json("POST", RESET_REQ, {"email": alice.email})
        token = _latest_reset_token()
        with SessionLocal() as db:
            rec = db.scalar(select(PasswordResetToken))
            rec.expires_at = utcnow() - timedelta(seconds=1)  # type: ignore[union-attr]
            db.commit()
        res = client.send_json(
            "POST", RESET_CONFIRM, {"token": token, "new_password": OTHER_PASSWORD}
        )
        assert res.status_code == 400

    def test_new_request_invalidates_previous_token(self, client: ApiClient, alice) -> None:  # type: ignore[no-untyped-def]
        client.send_json("POST", RESET_REQ, {"email": alice.email})
        first = _latest_reset_token()
        client.send_json("POST", RESET_REQ, {"email": alice.email})
        res = client.send_json(
            "POST", RESET_CONFIRM, {"token": first, "new_password": OTHER_PASSWORD}
        )
        assert res.status_code == 400

    def test_reset_revokes_existing_sessions(self, make_client, alice) -> None:  # type: ignore[no-untyped-def]
        victim = make_client()
        victim.login(alice.email)
        anon = make_client()
        anon.send_json("POST", RESET_REQ, {"email": alice.email})
        anon.send_json(
            "POST", RESET_CONFIRM, {"token": _latest_reset_token(), "new_password": OTHER_PASSWORD}
        )
        assert victim.get("/api/v1/auth/me").status_code == 401
        with SessionLocal() as db:
            assert db.scalar(
                select(AuditEvent).where(AuditEvent.event_type == "auth.password_reset.complete")
            )
