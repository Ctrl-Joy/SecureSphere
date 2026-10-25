#!/bin/sh
# Container entrypoint for single-service deployments (Render, or any Docker host).
set -eu

# Render provides the public URL; use it for reset links and the CORS allowlist
# unless they were set explicitly.
if [ -z "${SS_FRONTEND_URL:-}" ] && [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
    export SS_FRONTEND_URL="$RENDER_EXTERNAL_URL"
fi
if [ -z "${SS_CORS_ORIGINS:-}" ] && [ -n "${SS_FRONTEND_URL:-}" ]; then
    export SS_CORS_ORIGINS="$SS_FRONTEND_URL"
fi

echo "Applying database migrations..."
python -m alembic upgrade head

python -m app.cli bootstrap-admin

# The platform's proxy terminates TLS and is the only peer that can reach this port.
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-1}" \
    --proxy-headers \
    --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}" \
    --no-server-header \
    --timeout-keep-alive 5
