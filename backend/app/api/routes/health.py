from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return JSONResponse({"status": "ok"})


@router.get("/features")
def features() -> dict[str, bool]:
    """Lets the sign-in pages say so when this deployment cannot send email, instead of
    promising a reset link that will never arrive. Reveals nothing about any account."""
    return {"password_reset_email": get_settings().mail_backend != "none"}
