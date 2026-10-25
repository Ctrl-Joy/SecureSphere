"""Dashboard metrics computed from real database records."""

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import Principal, require_user
from app.core.database import get_db, utcnow
from app.models import AccountStatus, AuditEvent, Role, Severity, User
from app.schemas import ChecklistItem, DailyCount, DashboardSummary
from app.services import sessions

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CHART_DAYS = 14


@router.get("/summary", response_model=DashboardSummary)
def summary(
    principal: Principal = Depends(require_user), db: Session = Depends(get_db)
) -> DashboardSummary:
    user = principal.user
    is_admin = user.role == Role.ADMIN
    now = utcnow()
    week_ago = now - timedelta(days=7)
    chart_start = (now - timedelta(days=CHART_DAYS - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    mine = or_(AuditEvent.actor_id == user.id, AuditEvent.target_user_id == user.id)
    scope_filter = [] if is_admin else [mine]

    failed_logins = (
        db.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(
                AuditEvent.target_user_id == user.id,
                AuditEvent.event_type.in_(["auth.login.failure", "auth.lockout"]),
                AuditEvent.created_at >= week_ago,
            )
        )
        or 0
    )
    events_7d = (
        db.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(AuditEvent.created_at >= week_ago, *scope_filter)
        )
        or 0
    )

    day = func.date(AuditEvent.created_at)
    rows = db.execute(
        select(day, AuditEvent.severity, func.count())
        .where(AuditEvent.created_at >= chart_start, *scope_filter)
        .group_by(day, AuditEvent.severity)
    ).all()
    buckets = {
        (chart_start + timedelta(days=i)).date().isoformat(): DailyCount(
            date=(chart_start + timedelta(days=i)).date().isoformat()
        )
        for i in range(CHART_DAYS)
    }
    for raw_day, severity, count in rows:
        bucket = buckets.get(str(raw_day)[:10])
        if bucket is not None and severity in Severity.__members__.values():
            setattr(bucket, str(severity), count)

    active = sessions.count_active(db, user.id)
    password_age = (now - user.password_changed_at).days
    checklist = [
        ChecklistItem(
            key="password_age",
            label="Password changed in the last 180 days",
            ok=password_age <= 180,
            detail=f"Last changed {password_age} day(s) ago.",
        ),
        ChecklistItem(
            key="failed_logins",
            label="No failed sign-ins in the last 7 days",
            ok=failed_logins == 0,
            detail=f"{failed_logins} failed attempt(s) recorded against your account.",
        ),
        ChecklistItem(
            key="sessions",
            label="Three or fewer active sessions",
            ok=active <= 3,
            detail=f"{active} active session(s). Revoke any you do not recognise.",
        ),
    ]

    result = DashboardSummary(
        scope="admin" if is_admin else "user",
        active_sessions=active,
        failed_logins_7d=failed_logins,
        events_7d=events_7d,
        password_age_days=password_age,
        last_login_at=user.last_login_at,
        checklist=checklist,
        daily_events=list(buckets.values()),
    )
    if is_admin:
        result.total_users = db.scalar(select(func.count()).select_from(User)) or 0
        result.suspended_users = (
            db.scalar(
                select(func.count()).select_from(User).where(User.status == AccountStatus.SUSPENDED)
            )
            or 0
        )
        result.locked_users = (
            db.scalar(select(func.count()).select_from(User).where(User.locked_until > now)) or 0
        )
        result.high_severity_7d = (
            db.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.severity == Severity.HIGH, AuditEvent.created_at >= week_ago)
            )
            or 0
        )
    return result
