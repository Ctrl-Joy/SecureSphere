"""Administrative endpoints. Every route requires the ADMIN role (checked server-side)."""

import uuid
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.api.dependencies import Principal, get_ctx, require_admin
from app.api.pagination import paginate
from app.core.config import get_settings
from app.core.database import get_db, utcnow
from app.core.errors import ApiError
from app.models import AccountStatus, AuditEvent, Role, Severity, User, UserSession
from app.schemas import AdminUserUpdate, AdminUserView, AuditEventView, Page
from app.services import audit, sessions
from app.services.context import RequestContext

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _active_session_counts(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not user_ids:
        return {}
    now = utcnow()
    idle_cutoff = now - timedelta(minutes=get_settings().session_idle_minutes)
    rows = db.execute(
        select(UserSession.user_id, func.count())
        .where(
            UserSession.user_id.in_(user_ids),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
            UserSession.last_seen_at > idle_cutoff,
        )
        .group_by(UserSession.user_id)
    ).all()
    return {user_id: count for user_id, count in rows}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/users", response_model=Page[AdminUserView])
def list_users(
    q: str | None = Query(None, max_length=100),
    role: Role | None = None,
    status: AccountStatus | None = None,
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AdminUserView]:
    query = db.query(User)
    if q:
        # Bound parameter (never string-formatted SQL); LIKE wildcards are escaped too.
        pattern = f"%{_escape_like(q.strip().lower())}%"
        query = query.filter(
            or_(
                User.email.like(pattern, escape="\\"),
                func.lower(User.name).like(pattern, escape="\\"),
            )
        )
    if role:
        query = query.filter(User.role == role)
    if status:
        query = query.filter(User.status == status)
    rows, total = paginate(query.order_by(User.created_at.desc()), page, page_size)
    counts = _active_session_counts(db, [u.id for u in rows])
    items = [
        AdminUserView.model_validate(u).model_copy(update={"active_sessions": counts.get(u.id, 0)})
        for u in rows
    ]
    return Page[AdminUserView](items=items, total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserView)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db)) -> AdminUserView:
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(404, "not_found", "User not found.")
    view = AdminUserView.model_validate(user)
    return view.model_copy(update={"active_sessions": sessions.count_active(db, user.id)})


@router.patch("/users/{user_id}", response_model=AdminUserView)
def update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    principal: Principal = Depends(require_admin),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> AdminUserView:
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(404, "not_found", "User not found.")
    if user.id == principal.user.id:
        raise ApiError(400, "self_modification", "You cannot change your own role or status.")

    changes: dict[str, dict[str, str]] = {}
    if body.role is not None and body.role != user.role:
        changes["role"] = {"from": str(user.role), "to": str(body.role)}
        user.role = body.role
    if body.status is not None and body.status != user.status:
        changes["status"] = {"from": str(user.status), "to": str(body.status)}
        user.status = body.status
        if body.status == AccountStatus.ACTIVE:
            user.locked_until = None
            user.failed_login_count = 0

    if changes:
        # Privilege or status changes invalidate existing sessions so they take effect now.
        revoked = sessions.revoke_all_for_user(db, user.id, "privilege_change")
        audit.record(
            db,
            "admin.user.update",
            ctx=ctx,
            actor_id=principal.user.id,
            target_user_id=user.id,
            severity=Severity.HIGH if "role" in changes else Severity.MEDIUM,
            details={**changes, "sessions_revoked": revoked},
        )
        db.commit()
    view = AdminUserView.model_validate(user)
    return view.model_copy(update={"active_sessions": sessions.count_active(db, user.id)})


@router.post("/users/{user_id}/unlock", response_model=AdminUserView)
def unlock_user(
    user_id: uuid.UUID,
    principal: Principal = Depends(require_admin),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> AdminUserView:
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(404, "not_found", "User not found.")
    user.locked_until = None
    user.failed_login_count = 0
    audit.record(
        db, "admin.user.unlock", ctx=ctx, actor_id=principal.user.id, target_user_id=user.id
    )
    db.commit()
    view = AdminUserView.model_validate(user)
    return view.model_copy(update={"active_sessions": sessions.count_active(db, user.id)})


def _event_view(
    event: AuditEvent, actor_email: str | None, target_email: str | None
) -> AuditEventView:
    return AuditEventView.model_validate(event).model_copy(
        update={"actor_email": actor_email, "target_email": target_email}
    )


@router.get("/audit-events", response_model=Page[AuditEventView])
def list_audit_events(
    q: str | None = Query(None, max_length=64, description="Event type contains"),
    severity: Severity | None = None,
    outcome: str | None = Query(None, pattern="^(success|failure|ignored)$"),
    user_id: uuid.UUID | None = None,
    since: date | None = Query(None, description="From this UTC day (inclusive)"),
    until: date | None = Query(None, description="Up to this UTC day (inclusive)"),
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AuditEventView]:
    actor = aliased(User)
    target = aliased(User)
    query = (
        db.query(AuditEvent, actor.email, target.email)
        .outerjoin(actor, AuditEvent.actor_id == actor.id)
        .outerjoin(target, AuditEvent.target_user_id == target.id)
    )
    if q:
        query = query.filter(AuditEvent.event_type.like(f"%{_escape_like(q)}%", escape="\\"))
    if severity:
        query = query.filter(AuditEvent.severity == severity)
    if outcome:
        query = query.filter(AuditEvent.outcome == outcome)
    if user_id:
        query = query.filter(
            or_(AuditEvent.actor_id == user_id, AuditEvent.target_user_id == user_id)
        )
    if since:
        query = query.filter(AuditEvent.created_at >= datetime.combine(since, time.min, UTC))
    if until:
        end = datetime.combine(until + timedelta(days=1), time.min, UTC)
        query = query.filter(AuditEvent.created_at < end)
    rows, total = paginate(query.order_by(AuditEvent.created_at.desc()), page, page_size)
    return Page[AuditEventView](
        items=[_event_view(e, a, t) for e, a, t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/audit-events/{event_id}", response_model=AuditEventView)
def get_audit_event(event_id: uuid.UUID, db: Session = Depends(get_db)) -> AuditEventView:
    event = db.get(AuditEvent, event_id)
    if event is None:
        raise ApiError(404, "not_found", "Event not found.")
    return _event_view(
        event,
        event.actor.email if event.actor else None,
        event.target_user.email if event.target_user else None,
    )
