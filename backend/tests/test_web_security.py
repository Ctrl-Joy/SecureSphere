"""CSRF, injection, headers, rate limiting, error handling, request limits."""

from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models import AuditEvent, User
from tests.conftest import PASSWORD, ApiClient


class TestCsrf:
    def test_login_without_csrf_token_rejected(self, client: ApiClient, alice: User) -> None:
        res = client.post("/api/v1/auth/login", json={"email": alice.email, "password": PASSWORD})
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "csrf_failed"

    def test_authenticated_mutation_without_token_rejected(self, alice_client: ApiClient) -> None:
        res = alice_client.patch("/api/v1/profile", json={"name": "Mallory"})
        assert res.status_code == 403

    def test_forged_token_rejected(self, alice_client: ApiClient) -> None:
        res = alice_client.patch(
            "/api/v1/profile", json={"name": "Mallory"}, headers={"X-CSRF-Token": "0" * 64}
        )
        assert res.status_code == 403

    def test_pre_session_token_not_valid_for_session(self, alice_client: ApiClient) -> None:
        # A token minted for the anonymous double-submit flow is not the session's token.
        res = alice_client.patch(
            "/api/v1/profile",
            json={"name": "Mallory"},
            headers={"X-CSRF-Token": alice_client.cookies.get("ss_csrf") or "x"},
        )
        assert res.status_code == 403

    def test_valid_token_accepted(self, alice_client: ApiClient) -> None:
        res = alice_client.send_json("PATCH", "/api/v1/profile", {"name": "Alice Renamed"})
        assert res.status_code == 200
        assert res.json()["name"] == "Alice Renamed"


class TestInjection:
    def test_sql_injection_in_login_email(self, client: ApiClient, alice: User) -> None:
        res = client.login("' OR '1'='1' --@example.com", "x' OR '1'='1")
        assert res.status_code in (401, 422)

    def test_sql_injection_in_admin_search_is_literal(
        self, admin_client: ApiClient, alice: User
    ) -> None:
        for payload in ["' OR 1=1 --", "%", "_", "\\"]:
            res = admin_client.get("/api/v1/admin/users", params={"q": payload})
            assert res.status_code == 200
            assert res.json()["total"] == 0, payload
        with SessionLocal() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 2  # nothing dropped

    def test_markup_in_name_is_stored_as_data(self, alice_client: ApiClient) -> None:
        payload = "<img src=x onerror=alert(1)>"
        res = alice_client.send_json("PATCH", "/api/v1/profile", {"name": payload})
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/json")
        assert res.json()["name"] == payload  # React escapes on render; API returns JSON only

    def test_control_characters_in_name_rejected(self, alice_client: ApiClient) -> None:
        res = alice_client.send_json("PATCH", "/api/v1/profile", {"name": "bad\x00name"})
        assert res.status_code == 422


class TestHeadersAndErrors:
    def test_security_headers_present(self, client: ApiClient) -> None:
        res = client.get("/api/v1/health/live")
        h = res.headers
        assert h["x-content-type-options"] == "nosniff"
        assert h["x-frame-options"] == "DENY"
        assert h["referrer-policy"] == "no-referrer"
        assert "frame-ancestors 'none'" in h["content-security-policy"]
        assert h["cache-control"] == "no-store"
        assert h["x-request-id"]

    def test_unknown_route_returns_safe_error(self, client: ApiClient) -> None:
        res = client.get("/api/v1/does-not-exist")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "not_found"
        assert "Traceback" not in res.text

    def test_oversized_body_rejected(self, client: ApiClient) -> None:
        client.refresh_csrf()
        res = client.send_json(
            "POST", "/api/v1/auth/login", {"email": "a@b.co", "password": "x" * 100_000}
        )
        assert res.status_code == 413

    def test_cors_rejects_unknown_origin(self, client: ApiClient) -> None:
        res = client.options(
            "/api/v1/auth/login",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        assert "access-control-allow-origin" not in res.headers


class TestRateLimiting:
    def test_login_rate_limited_per_email(self, client: ApiClient) -> None:
        codes = [
            client.login("victim@example.com", "guess-number-xyz").status_code for _ in range(12)
        ]
        assert codes[:10] == [401] * 10
        assert codes[10:] == [429, 429]
        with SessionLocal() as db:
            n = db.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.event_type == "rate_limit.exceeded")
            )
        assert n == 1  # only the first violation in a window is logged

    def test_retry_after_header(self, client: ApiClient) -> None:
        for _ in range(6):
            res = client.send_json(
                "POST",
                "/api/v1/auth/register",
                {
                    "name": "Spam",
                    "email": "spam@example.com",
                    "password": "x",
                    "accept_terms": True,
                },
            )
        assert res.status_code == 429
        assert int(res.headers["retry-after"]) > 0


def test_health_endpoints(client: ApiClient) -> None:
    assert client.get("/api/v1/health/live").json() == {"status": "ok"}
    assert client.get("/api/v1/health/ready").json() == {"status": "ok"}


def test_redaction_hides_secrets_but_keeps_counts() -> None:
    from app.core.logging import redact

    out = redact(
        {"password": "x", "reset_token": "y", "sessions_revoked": 2, "nested": {"csrf": "z"}}
    )
    assert out == {
        "password": "[REDACTED]",
        "reset_token": "[REDACTED]",
        "sessions_revoked": 2,
        "nested": {"csrf": "[REDACTED]"},
    }
