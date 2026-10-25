"""Vertical and horizontal privilege-escalation attempts."""

import uuid

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import AuditEvent, User, UserSession
from tests.conftest import ApiClient, create_user

ADMIN_ROUTES = [
    ("GET", "/api/v1/admin/users"),
    ("GET", f"/api/v1/admin/users/{uuid.uuid4()}"),
    ("PATCH", f"/api/v1/admin/users/{uuid.uuid4()}"),
    ("GET", "/api/v1/admin/audit-events"),
    ("GET", f"/api/v1/admin/audit-events/{uuid.uuid4()}"),
]


def test_anonymous_cannot_reach_admin(client: ApiClient) -> None:
    for method, url in ADMIN_ROUTES:
        res = client.send_json(method, url, {} if method == "PATCH" else None)
        assert res.status_code == 401, url


def test_user_cannot_reach_admin(alice_client: ApiClient) -> None:
    for method, url in ADMIN_ROUTES:
        res = alice_client.send_json(method, url, {"role": "admin"} if method == "PATCH" else None)
        assert res.status_code == 403, url
        assert res.json()["error"]["code"] == "forbidden"
    with SessionLocal() as db:
        assert db.scalar(select(AuditEvent).where(AuditEvent.event_type == "authz.denied"))


def test_user_cannot_self_promote_via_admin_endpoint(alice_client: ApiClient, alice: User) -> None:
    res = alice_client.send_json("PATCH", f"/api/v1/admin/users/{alice.id}", {"role": "admin"})
    assert res.status_code == 403
    with SessionLocal() as db:
        assert db.get(User, alice.id).role == "user"  # type: ignore[union-attr]


def test_user_cannot_self_promote_via_profile(alice_client: ApiClient, alice: User) -> None:
    res = alice_client.send_json("PATCH", "/api/v1/profile", {"name": "Alice", "role": "admin"})
    assert res.status_code == 422
    res = alice_client.send_json("PATCH", "/api/v1/profile", {"name": "Alice", "status": "active"})
    assert res.status_code == 422
    with SessionLocal() as db:
        assert db.get(User, alice.id).role == "user"  # type: ignore[union-attr]


def test_admin_can_list_and_update_users(admin_client: ApiClient, alice: User) -> None:
    listing = admin_client.get("/api/v1/admin/users", params={"q": "alice"}).json()
    assert listing["total"] == 1
    assert "password_hash" not in str(listing)
    res = admin_client.send_json(
        "PATCH", f"/api/v1/admin/users/{alice.id}", {"status": "suspended"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "suspended"


def test_role_change_revokes_target_sessions(
    admin_client: ApiClient, make_client, alice: User
) -> None:  # type: ignore[no-untyped-def]
    alice_c = make_client()
    alice_c.login(alice.email)
    res = admin_client.send_json("PATCH", f"/api/v1/admin/users/{alice.id}", {"role": "admin"})
    assert res.status_code == 200
    assert alice_c.get("/api/v1/auth/me").status_code == 401
    with SessionLocal() as db:
        ev = db.scalar(select(AuditEvent).where(AuditEvent.event_type == "admin.user.update"))
        assert ev is not None and ev.severity == "high"
        assert ev.details["role"] == {"from": "user", "to": "admin"}


def test_admin_cannot_change_own_role(admin_client: ApiClient, admin: User) -> None:
    res = admin_client.send_json("PATCH", f"/api/v1/admin/users/{admin.id}", {"role": "user"})
    assert res.status_code == 400


def test_admin_update_rejects_unknown_fields(admin_client: ApiClient, alice: User) -> None:
    res = admin_client.send_json(
        "PATCH", f"/api/v1/admin/users/{alice.id}", {"password_hash": "x", "email": "a@b.c"}
    )
    assert res.status_code == 422


def test_cannot_revoke_another_users_session_idor(make_client, alice: User) -> None:  # type: ignore[no-untyped-def]
    bob = create_user("bob@example.com", "Bob Builder")
    alice_c, bob_c = make_client(), make_client()
    alice_c.login(alice.email)
    bob_c.login(bob.email)
    with SessionLocal() as db:
        bob_session = db.scalar(select(UserSession).where(UserSession.user_id == bob.id))
    res = alice_c.send_json("DELETE", f"/api/v1/sessions/{bob_session.id}")  # type: ignore[union-attr]
    # Same response as a non-existent id: no existence oracle.
    assert res.status_code == 404
    assert bob_c.get("/api/v1/auth/me").status_code == 200


def test_user_audit_feed_only_contains_own_events(make_client, alice: User) -> None:  # type: ignore[no-untyped-def]
    bob = create_user("bob@example.com", "Bob Builder")
    alice_c, bob_c = make_client(), make_client()
    alice_c.login(alice.email)
    bob_c.login(bob.email)
    items = alice_c.get("/api/v1/audit-events").json()["items"]
    assert items
    for ev in items:
        assert str(alice.id) in (ev["actor_id"], ev["target_user_id"])


def test_audit_events_cannot_be_modified(admin_client: ApiClient) -> None:
    events = admin_client.get("/api/v1/admin/audit-events").json()["items"]
    event_id = events[0]["id"]
    for method in ("DELETE", "PATCH"):
        res = admin_client.send_json(method, f"/api/v1/admin/audit-events/{event_id}", {})
        assert res.status_code == 405


def test_admin_audit_filters(admin_client: ApiClient, client: ApiClient, alice: User) -> None:
    client.login(alice.email, "wrong-password-123")
    res = admin_client.get(
        "/api/v1/admin/audit-events", params={"severity": "low", "q": "login.failure"}
    ).json()
    assert res["total"] >= 1
    assert all(e["severity"] == "low" for e in res["items"])
    detail = admin_client.get(f"/api/v1/admin/audit-events/{res['items'][0]['id']}")
    assert detail.status_code == 200
    assert detail.json()["target_email"] == alice.email
