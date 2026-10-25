from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    Principal,
    enforce_rate_limit,
    get_ctx,
    require_user,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import derive_csrf_token, generate_token, hash_token
from app.models import UserSession
from app.schemas import (
    ChangePasswordRequest,
    CsrfResponse,
    LoginRequest,
    MeResponse,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    UserPublic,
)
from app.services import audit, auth, rate_limit, sessions
from app.services.context import RequestContext

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_absolute_hours * 3600,
        httponly=True,
        secure=bool(settings.cookie_secure),
        samesite="lax",
        path="/",
    )
    response.delete_cookie(settings.csrf_cookie_name, path="/")


def _clear_cookies(response: Response) -> None:
    settings = get_settings()
    for name in (settings.session_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(
            name, path="/", secure=bool(settings.cookie_secure), httponly=True, samesite="lax"
        )


def _me(user_session: UserSession, token: str) -> MeResponse:
    return MeResponse(
        user=UserPublic.model_validate(user_session.user),
        csrf_token=derive_csrf_token(token),
        session_expires_at=user_session.expires_at,
    )


@router.get("/csrf", response_model=CsrfResponse)
def get_csrf_token(request: Request, response: Response) -> CsrfResponse:
    """Returns the CSRF token the client must echo in X-CSRF-Token on unsafe requests."""
    settings = get_settings()
    session_token = request.cookies.get(settings.session_cookie_name)
    if session_token:
        return CsrfResponse(csrf_token=derive_csrf_token(session_token))
    token = request.cookies.get(settings.csrf_cookie_name) or generate_token()
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        max_age=2 * 3600,
        httponly=True,
        secure=bool(settings.cookie_secure),
        samesite="strict",
        path="/",
    )
    return CsrfResponse(csrf_token=token)


@router.post("/register", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse)
def register(
    body: RegisterRequest, db: Session = Depends(get_db), ctx: RequestContext = Depends(get_ctx)
) -> MessageResponse:
    enforce_rate_limit(db, ctx, rate_limit.REGISTER_IP, ctx.ip)
    auth.register(db, name=body.name, email=str(body.email), password=body.password, ctx=ctx)
    return MessageResponse(
        message="Registration received. If this email was not already registered, "
        "your account is ready and you can sign in."
    )


@router.post("/login", response_model=MeResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> MeResponse:
    enforce_rate_limit(db, ctx, rate_limit.LOGIN_IP, ctx.ip)
    enforce_rate_limit(db, ctx, rate_limit.LOGIN_EMAIL, auth.normalize_email(str(body.email)))
    issued = auth.authenticate(db, email=str(body.email), password=body.password, ctx=ctx)

    # Session fixation defence: any session presented with this request is retired.
    previous = request.cookies.get(get_settings().session_cookie_name)
    if previous:
        old = db.query(UserSession).filter_by(token_hash=hash_token(previous)).one_or_none()
        if old is not None and old.id != issued.session.id:
            sessions.revoke(old, "replaced_by_login")
            db.commit()

    _set_session_cookie(response, issued.token)
    return _me(issued.session, issued.token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> Response:
    token = request.cookies.get(get_settings().session_cookie_name)
    session = sessions.resolve_session(db, token)
    if session is not None:
        sessions.revoke(session, "logout")
        audit.record(db, "auth.logout", ctx=ctx, actor_id=session.user_id)
        db.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
    _clear_cookies(response)
    return response


@router.get("/me", response_model=MeResponse)
def me(principal: Principal = Depends(require_user)) -> MeResponse:
    return _me(principal.session, principal.session_token)


@router.post("/change-password", response_model=MeResponse)
def change_password(
    body: ChangePasswordRequest,
    response: Response,
    principal: Principal = Depends(require_user),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> MeResponse:
    enforce_rate_limit(db, ctx, rate_limit.CHANGE_PASSWORD_USER, str(principal.user.id))
    issued = auth.change_password(
        db,
        user=principal.user,
        current_session=principal.session,
        current_password=body.current_password,
        new_password=body.new_password,
        ctx=ctx,
    )
    _set_session_cookie(response, issued.token)
    return _me(issued.session, issued.token)


@router.post(
    "/password-reset/request",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MessageResponse,
)
def password_reset_request(
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> MessageResponse:
    enforce_rate_limit(db, ctx, rate_limit.RESET_IP, ctx.ip)
    enforce_rate_limit(db, ctx, rate_limit.RESET_EMAIL, auth.normalize_email(str(body.email)))
    auth.request_password_reset(db, email=str(body.email), ctx=ctx)
    return MessageResponse(
        message="If an account exists for that email, a reset link has been sent."
    )


@router.post("/password-reset/confirm", response_model=MessageResponse)
def password_reset_confirm(
    body: PasswordResetConfirm,
    response: Response,
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> MessageResponse:
    enforce_rate_limit(db, ctx, rate_limit.RESET_CONFIRM_IP, ctx.ip)
    auth.confirm_password_reset(db, token=body.token, new_password=body.new_password, ctx=ctx)
    _clear_cookies(response)
    return MessageResponse(message="Your password has been reset. Please sign in.")
