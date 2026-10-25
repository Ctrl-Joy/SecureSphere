"""Dashboard, security lab, migrations and the full happy-path workflow."""

import os
import subprocess
import sys
from pathlib import Path

from tests.conftest import PASSWORD, ApiClient

BACKEND = Path(__file__).resolve().parents[1]


def test_full_workflow_register_login_protected_logout(client: ApiClient) -> None:
    reg = client.send_json(
        "POST",
        "/api/v1/auth/register",
        {
            "name": "Grace Hopper",
            "email": "grace@example.com",
            "password": PASSWORD,
            "accept_terms": True,
        },
    )
    assert reg.status_code == 202
    assert client.login("grace@example.com").status_code == 200
    assert client.get("/api/v1/profile").json()["email"] == "grace@example.com"
    updated = client.send_json("PATCH", "/api/v1/profile", {"name": "Rear Admiral Grace"})
    assert updated.json()["name"] == "Rear Admiral Grace"
    assert client.get("/api/v1/dashboard/summary").status_code == 200
    assert client.send_json("POST", "/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/profile").status_code == 401


def test_dashboard_user_scope(alice_client: ApiClient) -> None:
    data = alice_client.get("/api/v1/dashboard/summary").json()
    assert data["scope"] == "user"
    assert data["active_sessions"] == 1
    assert data["total_users"] is None
    assert len(data["daily_events"]) == 14
    assert sum(d["info"] for d in data["daily_events"]) >= 1  # the login event


def test_dashboard_admin_scope(admin_client: ApiClient, alice) -> None:  # type: ignore[no-untyped-def]
    data = admin_client.get("/api/v1/dashboard/summary").json()
    assert data["scope"] == "admin"
    assert data["total_users"] == 2


class TestLab:
    def test_requires_auth(self, client: ApiClient) -> None:
        assert client.send_json("POST", "/api/v1/lab/xss", {"input": "x"}).status_code == 401

    def test_sql_injection_payload_does_not_leak_hidden_rows(self, alice_client: ApiClient) -> None:
        res = alice_client.send_json("POST", "/api/v1/lab/sql-injection", {"input": "' OR 1=1 --"})
        data = res.json()
        assert data["injection_patterns_detected"] is True
        assert data["safe_results"] == []
        assert "' OR 1=1 --" in data["vulnerable_query"]  # shown as text only
        normal = alice_client.send_json(
            "POST", "/api/v1/lab/sql-injection", {"input": "USB"}
        ).json()
        assert [r["name"] for r in normal["safe_results"]] == ["Encrypted USB drive"]
        wildcard = alice_client.send_json(
            "POST", "/api/v1/lab/sql-injection", {"input": "%"}
        ).json()
        assert wildcard["safe_results"] == []

    def test_xss_encoding(self, alice_client: ApiClient) -> None:
        data = alice_client.send_json(
            "POST", "/api/v1/lab/xss", {"input": "<script>alert('x')</script>"}
        ).json()
        assert data["html_encoded"] == "&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;"
        assert data["contains_markup"] is True

    def test_hashing_salts(self, alice_client: ApiClient) -> None:
        data = alice_client.send_json(
            "POST", "/api/v1/lab/password-hashing", {"sample": "demo-only"}
        ).json()
        assert data["weak_sha256"] == data["weak_sha256_again"]
        assert data["argon2id"] != data["argon2id_again"]
        assert data["argon2id"].startswith("$argon2id$")

    def test_validation(self, alice_client: ApiClient) -> None:
        bad = alice_client.send_json(
            "POST",
            "/api/v1/lab/validation",
            {"username": "A!", "email": "x", "age": "20", "plan": "vip", "is_admin": True},
        ).json()
        assert bad["accepted"] is False
        fields = {e["field"] for e in bad["errors"]}
        assert {"username", "email", "age", "plan", "is_admin"} <= fields
        good = alice_client.send_json(
            "POST",
            "/api/v1/lab/validation",
            {"username": "ada_l", "email": "ada@example.com", "age": 36, "plan": "pro"},
        ).json()
        assert good["accepted"] is True


def test_migrations_apply_to_clean_database(tmp_path: Path) -> None:
    env = {**os.environ, "SS_DATABASE_URL": f"sqlite:///{(tmp_path / 'm.db').as_posix()}"}
    for args in (["upgrade", "head"], ["downgrade", "base"], ["upgrade", "head"]):
        result = subprocess.run(  # noqa: S603
            [sys.executable, "-m", "alembic", *args],
            cwd=BACKEND,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
    check = subprocess.run(
        [sys.executable, "-m", "alembic", "check"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert check.returncode == 0, check.stdout + check.stderr  # models match migrations
