"""Append-only security audit trail. There is deliberately no update or delete API."""

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.logging import redact
from app.models import AuditEvent, Severity
from app.services.context import RequestContext

log = logging.getLogger("securesphere.audit")

_MAX_DETAIL_STR = 200


def _sanitize(details: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in redact(details).items():
        if isinstance(value, str):
            value = value[:_MAX_DETAIL_STR]
        elif not isinstance(value, int | float | bool | type(None) | list | dict):
            value = str(value)[:_MAX_DETAIL_STR]
        clean[str(key)[:50]] = value
    return clean


def record(
    db: Session,
    event_type: str,
    *,
    ctx: RequestContext | None = None,
    actor_id: uuid.UUID | None = None,
    target_user_id: uuid.UUID | None = None,
    severity: Severity = Severity.INFO,
    outcome: str = "success",
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    """Adds an event to the caller's transaction; the caller commits."""
    event = AuditEvent(
        event_type=event_type,
        severity=severity,
        outcome=outcome,
        actor_id=actor_id,
        target_user_id=target_user_id,
        request_id=ctx.request_id if ctx else None,
        ip_prefix=ctx.ip_prefix if ctx else None,
        details=_sanitize(details or {}),
    )
    db.add(event)
    log.info(
        "audit_event",
        extra={"data": {"event_type": event_type, "severity": str(severity), "outcome": outcome}},
    )
    return event
