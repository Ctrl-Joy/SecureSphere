"""Single-service deployment: SPA serving, production config and first-admin bootstrap."""

from collections.abc import Iterator
from pathlib import Path
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select

from app.cli import bootstrap_admin
from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.security import verify_password
from app.main import create_app
from app.models import User

STRONG = "a-very-long passphrase 2026"


@pytest.fixture
def spa_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>SecureSphere</title>")
    (dist / "assets" / "app-123.js").write_text("console.log('app')")
    (dist / "theme-init.js").write_text("// theme")
    (tmp_path / "secret.txt").write_text("outside the build dir")
    monkeypatch.setenv("SS_STATIC_DIR", str(dist))
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            yield client
    finally:
        monkeypatch.delenv("SS_STATIC_DIR")
        get_settings.cache_clear()


class TestSpaServing:
    def test_index_and_client_routes_serve_app_shell(self, spa_client: TestClient) -> None:
        for path in ("/", "/dashboard", "/admin/users"):
            res = spa_client.get(path)
            assert res.status_code == 200, path
            assert "<title>SecureSphere</title>" in res.text
            assert res.headers["cache-control"] == "no-cache"

    def test_spa_gets_browser_csp_not_api_csp(self, spa_client: TestClient) -> None:
        csp = spa_client.get("/").headers["content-security-policy"]
        assert "script-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        api_csp = spa_client.get("/api/v1/health/live").headers["content-security-policy"]
        assert api_csp.startswith("default-src 'none'")

    def test_hashed_assets_are_cached_immutably(self, spa_client: TestClient) -> None:
        res = spa_client.get("/assets/app-123.js")
        assert res.status_code == 200
        assert "immutable" in res.headers["cache-control"]
        assert spa_client.get("/theme-init.js").text == "// theme"

    def test_path_traversal_cannot_escape_build_dir(self, spa_client: TestClient) -> None:
        for path in ("/..%2fsecret.txt", "/assets/..%2f..%2fsecret.txt", "/%2e%2e/secret.txt"):
            res = spa_client.get(path)
            assert "outside the build dir" not in res.text, path

    def test_api_routes_still_win_and_unknown_api_paths_404(self, spa_client: TestClient) -> None:
        assert spa_client.get("/api/v1/health/live").json() == {"status": "ok"}
        res = spa_client.get("/api/v1/nope")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "not_found"


class TestProductionConfig:
    base: ClassVar[dict[str, object]] = {
        "environment": "production",
        "secret_key": "x" * 40,
        "database_url": "postgres://u:p@db.internal:5432/securesphere",
        "cors_origins": ["https://securesphere.onrender.com"],
        "mail_backend": "none",
    }

    def test_render_style_database_url_is_normalized(self) -> None:
        s = Settings(**self.base)
        assert s.database_url == "postgresql+psycopg://u:p@db.internal:5432/securesphere"
        assert s.cookie_secure is True
        assert s.session_cookie_name == "__Host-ss_session"

    def test_mail_none_allowed_but_outbox_refused(self) -> None:
        Settings(**self.base)
        with pytest.raises(ValidationError, match="outbox is development-only"):
            Settings(**{**self.base, "mail_backend": "outbox"})

    def test_weak_secret_refused(self) -> None:
        with pytest.raises(ValidationError, match="SS_SECRET_KEY"):
            Settings(**{**self.base, "secret_key": "short"})


class TestBootstrapAdmin:
    def test_skips_without_variables(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SS_BOOTSTRAP_ADMIN_EMAIL", raising=False)
        assert bootstrap_admin() == 0
        with SessionLocal() as db:
            assert db.scalar(select(User)) is None

    def test_creates_admin_once_and_never_overwrites(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SS_BOOTSTRAP_ADMIN_EMAIL", "Owner@Example.com")
        monkeypatch.setenv("SS_BOOTSTRAP_ADMIN_NAME", "Site Owner")
        monkeypatch.setenv("SS_BOOTSTRAP_ADMIN_PASSWORD", STRONG)
        assert bootstrap_admin() == 0
        monkeypatch.setenv("SS_BOOTSTRAP_ADMIN_PASSWORD", "another passphrase 9999")
        assert bootstrap_admin() == 0
        with SessionLocal() as db:
            users = db.scalars(select(User)).all()
        assert len(users) == 1
        assert users[0].email == "owner@example.com"
        assert users[0].role == "admin"
        assert verify_password(users[0].password_hash, STRONG)

    def test_weak_password_does_not_create_account(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SS_BOOTSTRAP_ADMIN_EMAIL", "owner@example.com")
        monkeypatch.setenv("SS_BOOTSTRAP_ADMIN_PASSWORD", "password1234")
        assert bootstrap_admin() == 0  # never blocks server start
        with SessionLocal() as db:
            assert db.scalar(select(User)) is None
