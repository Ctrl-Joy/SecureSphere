"""Typed request/response contracts. Request models forbid unknown fields (mass assignment)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from app.models import AccountStatus, Role, Severity
from app.services.passwords import PASSWORD_MAX, PASSWORD_MIN


class StrictModel(BaseModel):
    # Whitespace is deliberately not stripped globally: it is significant in passwords.
    model_config = ConfigDict(extra="forbid")


def _clean_name(value: str) -> str:
    value = " ".join(value.split())
    if any(ord(ch) < 32 for ch in value):
        raise ValueError("Name contains invalid characters")
    if not value:
        raise ValueError("Name is required")
    return value


Name = Annotated[str, Field(min_length=1, max_length=100), AfterValidator(_clean_name)]


# ---------- auth ----------


class RegisterRequest(StrictModel):
    name: Name
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)
    accept_terms: Literal[True]


class LoginRequest(StrictModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)


class ChangePasswordRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)


class PasswordResetRequest(StrictModel):
    email: EmailStr = Field(max_length=254)


class PasswordResetConfirm(StrictModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)


class CsrfResponse(BaseModel):
    csrf_token: str


class MessageResponse(BaseModel):
    message: str


# ---------- users ----------


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    role: Role
    status: AccountStatus
    created_at: datetime
    last_login_at: datetime | None
    password_changed_at: datetime


class AdminUserView(UserPublic):
    failed_login_count: int
    locked_until: datetime | None
    active_sessions: int = 0


class MeResponse(BaseModel):
    user: UserPublic
    csrf_token: str
    session_expires_at: datetime


class ProfileUpdate(StrictModel):
    name: Name


class AdminUserUpdate(StrictModel):
    role: Role | None = None
    status: AccountStatus | None = None


# ---------- sessions ----------


class SessionView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    ip_prefix: str | None
    user_agent: str | None
    current: bool = False


# ---------- audit ----------


class AuditEventView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    event_type: str
    severity: Severity
    outcome: str
    actor_id: uuid.UUID | None
    actor_email: str | None = None
    target_user_id: uuid.UUID | None
    target_email: str | None = None
    request_id: str | None
    ip_prefix: str | None
    details: dict[str, Any]
    is_sample: bool


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---------- dashboard ----------


class DailyCount(BaseModel):
    date: str
    info: int = 0
    low: int = 0
    medium: int = 0
    high: int = 0


class ChecklistItem(BaseModel):
    key: str
    label: str
    ok: bool
    detail: str


class DashboardSummary(BaseModel):
    scope: Literal["user", "admin"]
    active_sessions: int
    failed_logins_7d: int
    events_7d: int
    password_age_days: int
    last_login_at: datetime | None
    checklist: list[ChecklistItem]
    daily_events: list[DailyCount]
    # admin-only aggregates
    total_users: int | None = None
    suspended_users: int | None = None
    locked_users: int | None = None
    high_severity_7d: int | None = None
