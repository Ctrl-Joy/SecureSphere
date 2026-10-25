"""Database-backed fixed-window rate limiter shared by all API workers.

Counters are written in their own short transaction so a limit is consumed even when
the surrounding request later fails (e.g. a wrong password).
"""

import hashlib
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import utcnow
from app.models import RateLimitBucket


@dataclass(frozen=True)
class Limit:
    name: str
    max_hits: int
    window_seconds: int


LOGIN_IP = Limit("login-ip", 20, 300)
LOGIN_EMAIL = Limit("login-email", 10, 900)
REGISTER_IP = Limit("register-ip", 5, 3600)
RESET_IP = Limit("reset-ip", 5, 3600)
RESET_EMAIL = Limit("reset-email", 3, 3600)
RESET_CONFIRM_IP = Limit("reset-confirm-ip", 10, 3600)
CHANGE_PASSWORD_USER = Limit("change-password-user", 5, 900)
LAB_USER = Limit("lab-user", 60, 60)


@dataclass(frozen=True)
class Result:
    allowed: bool
    retry_after: int
    first_violation: bool


def _hash_subject(subject: str) -> str:
    # Keys never contain raw emails or IPs.
    return hashlib.sha256(subject.encode()).hexdigest()[:32]


def hit(request_db: Session, limit: Limit, subject: str) -> Result:
    max_hits = max(1, math.floor(limit.max_hits * get_settings().rate_limit_multiplier))
    now = utcnow()
    epoch = int(now.timestamp())
    window_start = datetime.fromtimestamp(epoch - epoch % limit.window_seconds, UTC)
    key = f"{limit.name}:{_hash_subject(subject)}"
    retry_after = int(
        (window_start + timedelta(seconds=limit.window_seconds) - now).total_seconds()
    )

    # Separate session on the same engine, committed independently of the request.
    with Session(bind=request_db.get_bind()) as db:
        stmt = (
            update(RateLimitBucket)
            .where(RateLimitBucket.key == key, RateLimitBucket.window_start == window_start)
            .values(count=RateLimitBucket.count + 1)
            .returning(RateLimitBucket.count)
        )
        count = db.execute(stmt).scalar_one_or_none()
        if count is None:
            try:
                db.add(
                    RateLimitBucket(
                        key=key,
                        window_start=window_start,
                        count=1,
                        expires_at=window_start + timedelta(seconds=limit.window_seconds),
                    )
                )
                db.flush()
                count = 1
            except IntegrityError:  # another worker created the row first
                db.rollback()
                count = db.execute(stmt).scalar_one()
        db.commit()

    return Result(
        allowed=count <= max_hits,
        retry_after=max(1, retry_after),
        first_violation=count == max_hits + 1,
    )
