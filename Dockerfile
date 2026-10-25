# syntax=docker/dockerfile:1.7
# Single-service image: the FastAPI app serves both the API (/api) and the built React app.
# Used by render.yaml. (docker-compose.yml uses backend/ and frontend/ images instead.)

# 1. Build the frontend.
FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. Install locked backend dependencies.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./

# 3. Minimal runtime, non-root.
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH" \
    SS_STATIC_DIR=/app/static
RUN groupadd --system app && useradd --system --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /app /app
COPY --from=web /web/dist /app/static
COPY deploy/start.sh /app/start.sh
USER app
EXPOSE 8000
CMD ["sh", "/app/start.sh"]
