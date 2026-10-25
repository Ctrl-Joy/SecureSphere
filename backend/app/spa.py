"""Serves the built React app (Vite dist/) from the API process for single-service deployments.

Keeping the SPA and the API on one origin is what lets the session cookie stay
SameSite=Lax/__Host- and the CSRF design work unchanged in production.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}
_REVALIDATE = {"Cache-Control": "no-cache"}


def mount_spa(app: FastAPI, static_dir: str) -> None:
    root = Path(static_dir).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"SS_STATIC_DIR={static_dir} does not contain index.html")

    # Registered after the API routers, so /api/... always resolves to the API first.
    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise StarletteHTTPException(status_code=404)
        if path:
            candidate = (root / path).resolve()
            # Containment check blocks ../ traversal out of the build directory.
            if candidate.is_relative_to(root) and candidate.is_file():
                headers = _IMMUTABLE if path.startswith("assets/") else _REVALIDATE
                return FileResponse(candidate, headers=headers)
        # Client-side routes (/dashboard, /settings, ...) all load the app shell.
        return FileResponse(index, headers=_REVALIDATE)
