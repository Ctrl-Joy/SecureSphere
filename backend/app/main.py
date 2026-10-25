from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.dependencies import verify_csrf
from app.api.routes import account, admin, auth, dashboard, health, lab
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)


def create_app() -> FastAPI:
    settings = get_settings()  # validates configuration; raises on unsafe production config
    configure_logging(settings.log_level)

    docs = not settings.is_production
    app = FastAPI(
        title="SecureSphere API",
        version="1.0.0",
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )

    api = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_csrf)])
    api.include_router(health.router)
    api.include_router(auth.router)
    api.include_router(account.router)
    api.include_router(dashboard.router)
    api.include_router(admin.router)
    api.include_router(lab.router)
    app.include_router(api)

    register_error_handlers(app)

    # Order: last added runs first (outermost).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
        max_age=600,
    )
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    app.add_middleware(RequestContextMiddleware)
    return app


app = create_app()
