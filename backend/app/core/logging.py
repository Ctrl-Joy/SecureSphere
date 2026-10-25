"""Structured JSON logging with defensive redaction of sensitive keys."""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_SENSITIVE_MARKERS = (
    "password",
    "passwd",
    "token",
    "secret",
    "cookie",
    "authorization",
    "csrf",
    "api_key",
)


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: "[REDACTED]" if any(m in str(k).lower() for m in _SENSITIVE_MARKERS) else redact(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if rid := request_id_var.get():
            payload["request_id"] = rid
        extra = getattr(record, "data", None)
        if isinstance(extra, dict):
            payload.update(redact(extra))
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # Uvicorn's access log prints raw query strings; our middleware logs requests instead.
    logging.getLogger("uvicorn.access").disabled = True
