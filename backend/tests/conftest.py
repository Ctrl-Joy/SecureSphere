import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="securesphere-tests-"))
# Must be set before the app (and its engine) is imported.
os.environ.update(
    {
        "SS_ENVIRONMENT": "test",
        # CI sets SS_TEST_DATABASE_URL to run the same suite against PostgreSQL.
        "SS_DATABASE_URL": os.environ.get(
            "SS_TEST_DATABASE_URL", f"sqlite:///{(_TMP / 'test.db').as_posix()}"
        ),
        "SS_SECRET_KEY": "test-secret-key-0123456789-abcdefghijklmnop",
        "SS_MAIL_OUTBOX_DIR": str(_TMP / "mail"),
        "SS_LOG_LEVEL": "WARNING",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402

PASSWORD = "Tr0ub4dor & horses 2026"
OTHER_PASSWORD = "an0ther-Long passphrase!"
MAIL_DIR = _TMP / "mail"


@pytest.fixture(autouse=True)
def _fresh_db() -> Iterator[None]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    for f in MAIL_DIR.glob("*.eml") if MAIL_DIR.exists() else []:
        f.unlink()
    yield


class ApiClient(TestClient):
    """TestClient that manages the CSRF token like the real frontend does."""

    csrf: str | None = None

    def refresh_csrf(self) -> str:
        self.csrf = self.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.csrf

    def send_json(self, method: str, url: str, json: object | None = None, **kw):  # type: ignore[no-untyped-def]
        if self.csrf is None:
            self.refresh_csrf()
        headers = {"X-CSRF-Token": self.csrf or "", **kw.pop("headers", {})}
        return self.request(method, url, json=json, headers=headers, **kw)

    def login(self, email: str, password: str = PASSWORD):  # type: ignore[no-untyped-def]
        self.refresh_csrf()
        res = self.send_json("POST", "/api/v1/auth/login", {"email": email, "password": password})
        if res.status_code == 200:
            self.csrf = res.json()["csrf_token"]
        return res


@pytest.fixture
def client() -> Iterator[ApiClient]:
    with ApiClient(app) as c:
        yield c


@pytest.fixture
def make_client() -> Iterator[object]:
    clients: list[ApiClient] = []

    def factory() -> ApiClient:
        c = ApiClient(app)
        clients.append(c)
        return c

    yield factory
    for c in clients:
        c.close()


def create_user(
    email: str = "alice@example.com",
    name: str = "Alice Example",
    role: Role = Role.USER,
    password: str = PASSWORD,
) -> User:
    with SessionLocal() as db:
        user = User(email=email, name=name, role=role, password_hash=hash_password(password))
        db.add(user)
        db.commit()
        return user


@pytest.fixture
def alice() -> User:
    return create_user()


@pytest.fixture
def admin() -> User:
    return create_user("root@example.com", "Rita Root", Role.ADMIN)


@pytest.fixture
def alice_client(client: ApiClient, alice: User) -> ApiClient:
    assert client.login(alice.email).status_code == 200
    return client


@pytest.fixture
def admin_client(make_client, admin: User) -> ApiClient:  # type: ignore[no-untyped-def]
    c = make_client()
    assert c.login(admin.email).status_code == 200
    return c
