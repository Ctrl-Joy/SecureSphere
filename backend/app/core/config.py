"""Centralised, validated application configuration.

All settings come from environment variables prefixed with ``SS_`` (or a local
``.env`` file). Production-only invariants are enforced at startup so a
misconfigured deployment fails fast instead of running insecurely.
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Defaults are anchored to the backend folder so they work from any working directory.
BACKEND_DIR = Path(__file__).resolve().parents[2]
_VAR = (BACKEND_DIR / "var").as_posix()

_PLACEHOLDER_SECRETS = {"", "change-me", "changeme", "dev-insecure-secret-key-change-me-please"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_prefix="SS_", extra="ignore"
    )

    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "SecureSphere"
    log_level: str = "INFO"

    database_url: str = f"sqlite:///{_VAR}/securesphere.db"
    # Used as an HMAC key for hashing session/reset tokens and deriving CSRF tokens.
    secret_key: SecretStr = SecretStr("dev-insecure-secret-key-change-me-please")

    frontend_url: str = "http://localhost:5180"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5180"]
    )

    # Sessions
    session_idle_minutes: int = Field(default=30, ge=1, le=24 * 60)
    session_absolute_hours: int = Field(default=12, ge=1, le=24 * 30)
    cookie_secure: bool | None = None  # defaults to True in production
    max_sessions_per_user: int = Field(default=10, ge=1, le=100)

    # Account protection
    login_max_failures: int = Field(default=5, ge=1)
    lockout_minutes: int = Field(default=15, ge=1)
    password_reset_minutes: int = Field(default=30, ge=5, le=24 * 60)

    # Rate limiting: multiply every limit (tests use a large value to stay out of the way)
    rate_limit_multiplier: float = Field(default=1.0, gt=0)

    # Request hardening
    max_request_bytes: int = Field(default=64 * 1024, ge=1024)

    # Retention (days)
    audit_retention_days: int = Field(default=180, ge=1)
    session_retention_days: int = Field(default=30, ge=1)

    # Email delivery: "outbox" writes messages to files (development only), "smtp" sends,
    # "none" disables email (password-reset requests are accepted but nothing is sent).
    mail_backend: Literal["outbox", "smtp", "none"] = "outbox"
    mail_outbox_dir: str = f"{_VAR}/dev_mail"
    mail_from: str = "SecureSphere <no-reply@securesphere.local>"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = True

    # Built frontend (Vite dist/) to serve from the API process; unset in development,
    # where Vite serves the frontend itself.
    static_dir: str | None = None

    @field_validator("database_url", mode="after")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        # Hosting providers (e.g. Render) hand out postgres:// or postgresql:// URLs;
        # SQLAlchemy needs the driver named explicitly.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _enforce_production_invariants(self) -> "Settings":
        if self.cookie_secure is None:
            self.cookie_secure = self.environment == "production"
        if self.environment != "production":
            return self
        problems = []
        secret = self.secret_key.get_secret_value()
        if secret in _PLACEHOLDER_SECRETS or len(secret) < 32:
            problems.append("SS_SECRET_KEY must be a random value of at least 32 characters")
        if not self.database_url.startswith("postgresql"):
            problems.append("SS_DATABASE_URL must point to PostgreSQL in production")
        if not self.cookie_secure:
            problems.append("SS_COOKIE_SECURE cannot be disabled in production")
        if "*" in self.cors_origins:
            problems.append("SS_CORS_ORIGINS cannot contain '*'")
        if self.mail_backend == "outbox":
            problems.append("SS_MAIL_BACKEND=outbox is development-only; use smtp or none")
        if problems:
            raise ValueError("; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def session_cookie_name(self) -> str:
        # The __Host- prefix makes browsers reject the cookie unless it is Secure,
        # host-only and scoped to "/".
        return "__Host-ss_session" if self.cookie_secure else "ss_session"

    @property
    def csrf_cookie_name(self) -> str:
        return "__Host-ss_csrf" if self.cookie_secure else "ss_csrf"


@lru_cache
def get_settings() -> Settings:
    return Settings()
