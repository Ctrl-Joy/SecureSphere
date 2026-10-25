"""Dependency-injected authentication, authorization and CSRF enforcement.

Authorization is deny-by-default: every router other than the public auth/health
endpoints is mounted with ``require_user`` or ``require_admin``.
"""

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.security import constant_time_equals, derive_csrf_token
from app.models import Role, Severity, User, UserSession
from app.services import audit, rate_limit
from app.services.context import RequestContext, build_context
from app.services.sessions import resolve_session

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "X-CSRF-Token"


def get_ctx(request: Request) -> RequestContext:
    return build_context(request)


def verify_csrf(request: Request) -> None:
    """Applied to every API route.

    * With a session cookie: the header must equal HMAC(secret, session token)
      (synchronizer token pattern, nothing extra stored).
    * Without one (login/register/reset): double-submit, the header must equal the
      HttpOnly pre-session CSRF cookie issued by GET /auth/csrf.
    """
    if request.method in SAFE_METHODS:
        return
    settings = get_settings()
    supplied = request.headers.get(CSRF_HEADER)
    session_token = request.cookies.get(settings.session_cookie_name)
    expected = (
        derive_csrf_token(session_token)
        if session_token
        else request.cookies.get(settings.csrf_cookie_name)
    )
    if not constant_time_equals(supplied, expected):
        raise ApiError(403, "csrf_failed", "Security token missing or invalid. Reload and retry.")


@dataclass(frozen=True)
class Principal:
    user: User
    session: UserSession
    session_token: str


def get_principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    token = request.cookies.get(get_settings().session_cookie_name)
    session = resolve_session(db, token)
    if session is None or token is None:
        raise ApiError(401, "unauthenticated", "Please sign in to continue.")
    return Principal(user=session.user, session=session, session_token=token)


def require_user(principal: Principal = Depends(get_principal)) -> Principal:
    return principal


def require_admin(
    request: Request,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> Principal:
    # The role comes from the database row, never from anything the client sent.
    if principal.user.role != Role.ADMIN:
        audit.record(
            db,
            "authz.denied",
            ctx=ctx,
            actor_id=principal.user.id,
            severity=Severity.MEDIUM,
            outcome="failure",
            details={"method": request.method, "path": request.url.path},
        )
        db.commit()
        raise ApiError(403, "forbidden", "You do not have permission to perform this action.")
    return principal


def enforce_rate_limit(
    db: Session, ctx: RequestContext, limit: rate_limit.Limit, subject: str | None
) -> None:
    if not subject:
        return
    result = rate_limit.hit(db, limit, subject)
    if result.allowed:
        return
    if result.first_violation:
        audit.record(
            db,
            "rate_limit.exceeded",
            ctx=ctx,
            severity=Severity.MEDIUM,
            outcome="failure",
            details={"limit": limit.name},
        )
        db.commit()
    raise ApiError(
        429,
        "rate_limited",
        "Too many attempts. Please wait and try again.",
        headers={"Retry-After": str(result.retry_after)},
    )
