"""Profile, own sessions and own security activity (USER role)."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.dependencies import Principal, get_ctx, require_user
from app.api.pagination import paginate
from app.core.database import get_db
from app.core.errors import ApiError
from app.models import AuditEvent, Severity, UserSession
from app.schemas import (
    AuditEventView,
    MessageResponse,
    Page,
    ProfileUpdate,
    SessionView,
    UserPublic,
)
from app.services import audit, sessions
from app.services.context import RequestContext

router = APIRouter(tags=["account"], dependencies=[Depends(require_user)])


@router.get("/profile", response_model=UserPublic)
def get_profile(principal: Principal = Depends(require_user)) -> UserPublic:
    return UserPublic.model_validate(principal.user)


@router.patch("/profile", response_model=UserPublic)
def update_profile(
    body: ProfileUpdate,
    principal: Principal = Depends(require_user),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> UserPublic:
    # ProfileUpdate only declares `name` and forbids extra fields, so role, status or
    # email cannot be mass-assigned through this endpoint.
    user = principal.user
    if body.name != user.name:
        user.name = body.name
        audit.record(
            db,
            "profile.update",
            ctx=ctx,
            actor_id=user.id,
            target_user_id=user.id,
            details={"fields": ["name"]},
        )
        db.commit()
    return UserPublic.model_validate(user)


@router.get("/sessions", response_model=list[SessionView])
def list_sessions(
    principal: Principal = Depends(require_user), db: Session = Depends(get_db)
) -> list[SessionView]:
    rows = db.scalars(
        sessions.active_sessions_query(principal.user.id)
        .order_by(UserSession.last_seen_at.desc())
        .limit(50)
    ).all()
    return [
        SessionView.model_validate(row).model_copy(
            update={"current": row.id == principal.session.id}
        )
        for row in rows
    ]


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
def revoke_session(
    session_id: uuid.UUID,
    principal: Principal = Depends(require_user),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> MessageResponse:
    # Ownership is part of the query: another user's session id is indistinguishable
    # from a non-existent one (no IDOR, no existence oracle).
    target = db.scalar(
        sessions.active_sessions_query(principal.user.id).where(UserSession.id == session_id)
    )
    if target is None:
        raise ApiError(404, "not_found", "Session not found.")
    if target.id == principal.session.id:
        raise ApiError(400, "current_session", "Use sign out to end your current session.")
    sessions.revoke(target, "revoked_by_user")
    audit.record(
        db,
        "session.revoke",
        ctx=ctx,
        actor_id=principal.user.id,
        target_user_id=principal.user.id,
        details={"session_id": str(target.id)},
    )
    db.commit()
    return MessageResponse(message="Session revoked.")


@router.delete("/sessions", response_model=MessageResponse, status_code=status.HTTP_200_OK)
def revoke_other_sessions(
    principal: Principal = Depends(require_user),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> MessageResponse:
    count = sessions.revoke_all_for_user(
        db, principal.user.id, "revoked_by_user", except_id=principal.session.id
    )
    audit.record(
        db,
        "session.revoke_others",
        ctx=ctx,
        actor_id=principal.user.id,
        target_user_id=principal.user.id,
        severity=Severity.LOW,
        details={"sessions_revoked": count},
    )
    db.commit()
    return MessageResponse(message=f"Signed out of {count} other session(s).")


@router.get("/audit-events", response_model=Page[AuditEventView])
def my_audit_events(
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(20, ge=1, le=100),
    severity: Severity | None = None,
    principal: Principal = Depends(require_user),
    db: Session = Depends(get_db),
) -> Page[AuditEventView]:
    me = principal.user.id
    query = db.query(AuditEvent).filter(
        or_(AuditEvent.actor_id == me, AuditEvent.target_user_id == me)
    )
    if severity:
        query = query.filter(AuditEvent.severity == severity)
    rows, total = paginate(query.order_by(AuditEvent.created_at.desc()), page, page_size)
    return Page[AuditEventView](
        items=[AuditEventView.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
