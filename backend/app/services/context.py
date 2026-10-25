from dataclasses import dataclass

from fastapi import Request

from app.core.security import anonymize_ip


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str | None
    ip: str | None  # full address: used only for rate-limit keys, never persisted
    ip_prefix: str | None
    user_agent: str | None


def build_context(request: Request) -> RequestContext:
    # request.client already reflects X-Forwarded-For when uvicorn runs with
    # --proxy-headers and a restricted --forwarded-allow-ips list.
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return RequestContext(
        request_id=getattr(request.state, "request_id", None),
        ip=ip,
        ip_prefix=anonymize_ip(ip),
        user_agent=ua[:200] if ua else None,
    )
