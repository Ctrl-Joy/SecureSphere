"""Uniform error envelope: {"error": {"code", "message", "fields"?, "request_id"?}}."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("securesphere.errors")


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        fields: list[dict[str, str]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        self.headers = headers


def _body(request: Request, code: str, message: str, **extra: Any) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message, **extra}
    if rid := getattr(request.state, "request_id", None):
        error["request_id"] = rid
    return {"error": error}


_STATUS_CODES = {
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        extra = {"fields": exc.fields} if exc.fields else {}
        return JSONResponse(
            _body(request, exc.code, exc.message, **extra),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "http_error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            _body(request, code, message), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            message = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
            # Input values are intentionally not echoed back (they may contain secrets).
            fields.append({"field": ".".join(loc) or "body", "message": message})
        return JSONResponse(
            _body(request, "validation_error", "Some fields are invalid.", fields=fields),
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error")
        return JSONResponse(
            _body(request, "internal_error", "An unexpected error occurred."), status_code=500
        )
