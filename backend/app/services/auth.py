"""Registration, login, password change and reset business logic."""

import logging
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import utcnow
from app.core.errors import ApiError
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.models import AccountStatus, PasswordResetToken, Severity, User, UserSession
from app.services import audit, mail, sessions
from app.services.context import RequestContext
from app.services.passwords import password_problems

log = logging.getLogger("securesphere.auth")

INVALID_CREDENTIALS = "Invalid email or password."


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _check_password_policy(password: str, *, email: str, name: str, field: str) -> None:
    problems = password_problems(password, email=email, name=name)
    if problems:
        raise ApiError(
            422,
            "weak_password",
            "Password does not meet the policy.",
            fields=[{"field": field, "message": " ".join(problems)}],
        )


def register(db: Session, *, name: str, email: str, password: str, ctx: RequestContext) -> None:
    """Creates an account. Never reveals whether the email was already registered."""
    email = normalize_email(email)
    _check_password_policy(password, email=email, name=name, field="password")

    if db.scalar(select(User.id).where(User.email == email)) is not None:
        # Same response as success; the owner would receive a notice by email in production.
        audit.record(
            db,
            "auth.register.duplicate",
            ctx=ctx,
            severity=Severity.LOW,
            outcome="failure",
            details={"reason": "email_already_registered"},
        )
        db.commit()
        return

    user = User(name=name, email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # concurrent registration of the same email
        db.rollback()
        return
    audit.record(db, "auth.register", ctx=ctx, actor_id=user.id, target_user_id=user.id)
    db.commit()


def authenticate(
    db: Session, *, email: str, password: str, ctx: RequestContext
) -> sessions.IssuedSession:
    settings = get_settings()
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == email))
    now = utcnow()

    # Always run a hash verification so timing does not reveal account existence.
    password_ok = verify_password(user.password_hash if user else None, password)

    if user is None:
        audit.record(
            db,
            "auth.login.failure",
            ctx=ctx,
            severity=Severity.LOW,
            outcome="failure",
            details={"reason": "unknown_account"},
        )
        db.commit()
        raise ApiError(401, "invalid_credentials", INVALID_CREDENTIALS)

    if user.locked_until and user.locked_until > now:
        audit.record(
            db,
            "auth.login.blocked",
            ctx=ctx,
            target_user_id=user.id,
            severity=Severity.MEDIUM,
            outcome="failure",
            details={"reason": "account_locked"},
        )
        db.commit()
        raise ApiError(401, "invalid_credentials", INVALID_CREDENTIALS)

    if not password_ok:
        user.failed_login_count += 1
        locked = user.failed_login_count >= settings.login_max_failures
        if locked:
            user.locked_until = now + timedelta(minutes=settings.lockout_minutes)
            user.failed_login_count = 0
        audit.record(
            db,
            "auth.lockout" if locked else "auth.login.failure",
            ctx=ctx,
            target_user_id=user.id,
            severity=Severity.HIGH if locked else Severity.LOW,
            outcome="failure",
            details={"reason": "bad_password", "lockout_minutes": settings.lockout_minutes}
            if locked
            else {"reason": "bad_password"},
        )
        db.commit()
        raise ApiError(401, "invalid_credentials", INVALID_CREDENTIALS)

    if user.status != AccountStatus.ACTIVE:
        audit.record(
            db,
            "auth.login.blocked",
            ctx=ctx,
            target_user_id=user.id,
            severity=Severity.MEDIUM,
            outcome="failure",
            details={"reason": "account_suspended"},
        )
        db.commit()
        raise ApiError(401, "invalid_credentials", INVALID_CREDENTIALS)

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    issued = sessions.create_session(db, user, ctx)
    audit.record(db, "auth.login.success", ctx=ctx, actor_id=user.id, target_user_id=user.id)
    db.commit()
    return issued


def change_password(
    db: Session,
    *,
    user: User,
    current_session: UserSession,
    current_password: str,
    new_password: str,
    ctx: RequestContext,
) -> sessions.IssuedSession:
    if not verify_password(user.password_hash, current_password):
        audit.record(
            db,
            "auth.password_change.failure",
            ctx=ctx,
            actor_id=user.id,
            target_user_id=user.id,
            severity=Severity.MEDIUM,
            outcome="failure",
            details={"reason": "bad_current_password"},
        )
        db.commit()
        raise ApiError(
            400,
            "invalid_current_password",
            "Current password is incorrect.",
            fields=[{"field": "current_password", "message": "Current password is incorrect."}],
        )
    if verify_password(user.password_hash, new_password):
        raise ApiError(
            422,
            "password_reused",
            "Choose a password different from the current one.",
            fields=[{"field": "new_password", "message": "Must differ from the current password."}],
        )
    _check_password_policy(new_password, email=user.email, name=user.name, field="new_password")

    user.password_hash = hash_password(new_password)
    user.password_changed_at = utcnow()
    # Every session, including the current one, is replaced: the caller receives a new token.
    revoked = sessions.revoke_all_for_user(db, user.id, "password_changed")
    issued = sessions.create_session(db, user, ctx)
    audit.record(
        db,
        "auth.password_change",
        ctx=ctx,
        actor_id=user.id,
        target_user_id=user.id,
        severity=Severity.MEDIUM,
        details={"sessions_revoked": revoked},
    )
    db.commit()
    return issued


def request_password_reset(db: Session, *, email: str, ctx: RequestContext) -> None:
    """Always behaves the same externally, whether or not the account exists."""
    settings = get_settings()
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or user.status != AccountStatus.ACTIVE:
        audit.record(
            db,
            "auth.password_reset.request",
            ctx=ctx,
            outcome="ignored",
            details={"reason": "no_eligible_account"},
        )
        db.commit()
        return

    now = utcnow()
    # Only the newest link is valid.
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    token = generate_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=now,
            expires_at=now + timedelta(minutes=settings.password_reset_minutes),
        )
    )
    audit.record(db, "auth.password_reset.request", ctx=ctx, target_user_id=user.id)
    db.commit()

    link = f"{settings.frontend_url.rstrip('/')}/reset-password#token={token}"
    try:
        mail.send(
            user.email,
            "Reset your SecureSphere password",
            f"Hello {user.name},\n\nUse this link within {settings.password_reset_minutes} "
            f"minutes to choose a new password:\n\n{link}\n\n"
            "If you did not request this, you can ignore this email.\n",
        )
    except Exception:  # delivery failure must not reveal anything to the requester
        log.exception("password_reset_mail_failed")


def confirm_password_reset(
    db: Session, *, token: str, new_password: str, ctx: RequestContext
) -> None:
    now = utcnow()
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(token))
    )
    if record is None or record.used_at is not None or record.expires_at <= now:
        audit.record(
            db,
            "auth.password_reset.failure",
            ctx=ctx,
            severity=Severity.LOW,
            outcome="failure",
            details={"reason": "invalid_or_expired_token"},
        )
        db.commit()
        raise ApiError(400, "invalid_token", "This reset link is invalid or has expired.")

    user = db.get(User, record.user_id)
    if user is None or user.status != AccountStatus.ACTIVE:
        raise ApiError(400, "invalid_token", "This reset link is invalid or has expired.")
    _check_password_policy(new_password, email=user.email, name=user.name, field="new_password")

    record.used_at = now
    user.password_hash = hash_password(new_password)
    user.password_changed_at = now
    user.failed_login_count = 0
    user.locked_until = None
    revoked = sessions.revoke_all_for_user(db, user.id, "password_reset")
    audit.record(
        db,
        "auth.password_reset.complete",
        ctx=ctx,
        target_user_id=user.id,
        severity=Severity.MEDIUM,
        details={"sessions_revoked": revoked},
    )
    db.commit()
