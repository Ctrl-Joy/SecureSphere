"""Opaque, server-side sessions. Only an HMAC of the session token is stored."""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import utcnow
from app.core.security import generate_token, hash_token
from app.models import AccountStatus, User, UserSession
from app.services.context import RequestContext

# Avoid a write on every request; last-seen precision of one minute is enough for idle timeout.
_TOUCH_INTERVAL = timedelta(seconds=60)


@dataclass(frozen=True)
class IssuedSession:
    token: str
    session: UserSession


def create_session(db: Session, user: User, ctx: RequestContext) -> IssuedSession:
    settings = get_settings()
    now = utcnow()
    token = generate_token()
    session = UserSession(
        token_hash=hash_token(token),
        user_id=user.id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_absolute_hours),
        ip_prefix=ctx.ip_prefix,
        user_agent=ctx.user_agent,
    )
    db.add(session)
    db.flush()
    _enforce_session_cap(db, user.id, settings.max_sessions_per_user)
    return IssuedSession(token=token, session=session)


def _enforce_session_cap(db: Session, user_id: uuid.UUID, cap: int) -> None:
    active = db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_seen_at.desc())
    ).all()
    now = utcnow()
    for stale in active[cap:]:
        stale.revoked_at = now
        stale.revoke_reason = "session_limit"


def resolve_session(db: Session, token: str | None) -> UserSession | None:
    """Returns the live session for a token, enforcing idle and absolute expiry."""
    if not token or len(token) > 100:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None or session.revoked_at is not None:
        return None
    now = utcnow()
    idle_limit = timedelta(minutes=get_settings().session_idle_minutes)
    if now >= session.expires_at or now - session.last_seen_at > idle_limit:
        session.revoked_at = now
        session.revoke_reason = "expired"
        db.commit()
        return None
    if session.user.status != AccountStatus.ACTIVE:
        session.revoked_at = now
        session.revoke_reason = "account_suspended"
        db.commit()
        return None
    if now - session.last_seen_at > _TOUCH_INTERVAL:
        session.last_seen_at = now
        db.commit()
    return session


def revoke(session: UserSession, reason: str) -> None:
    if session.revoked_at is None:
        session.revoked_at = utcnow()
        session.revoke_reason = reason


def revoke_all_for_user(
    db: Session, user_id: uuid.UUID, reason: str, *, except_id: uuid.UUID | None = None
) -> int:
    stmt = (
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoke_reason=reason)
    )
    if except_id is not None:
        stmt = stmt.where(UserSession.id != except_id)
    return db.execute(stmt).rowcount  # type: ignore[attr-defined, no-any-return]


def active_sessions_query(user_id: uuid.UUID):  # type: ignore[no-untyped-def]
    now = utcnow()
    idle_cutoff = now - timedelta(minutes=get_settings().session_idle_minutes)
    return select(UserSession).where(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
        UserSession.last_seen_at > idle_cutoff,
    )


def count_active(db: Session, user_id: uuid.UUID) -> int:
    sub = active_sessions_query(user_id).subquery()
    return db.scalar(select(func.count()).select_from(sub)) or 0
