# =========================================================
# Backend image — FastAPI on Python 3.11 (slim, multi-stage)
# =========================================================

# ---------- Stage 1: builder ----------
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps required by psycopg, openpyxl, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install Python deps into a venv we can copy into the runtime image.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip install gunicorn uvicorn[standard]


# ---------- Stage 2: runtime ----------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}"

# Runtime system deps (libpq for psycopg, curl for healthcheck).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd --create-home --shell /bin/bash app

# Copy venv from the builder stage
COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=app:app . /app

USER app

EXPOSE 8001

# Healthcheck — public /api/company is unauth and cheap.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8001/api/company || exit 1

# Production WSGI/ASGI: gunicorn + uvicorn workers.
# Tune workers via env GUNICORN_WORKERS (default 4) and timeout via GUNICORN_TIMEOUT (60s).
CMD ["sh", "-c", "gunicorn server:app \
    -k uvicorn.workers.UvicornWorker \
    -w ${GUNICORN_WORKERS:-4} \
    -b 0.0.0.0:8001 \
    --timeout ${GUNICORN_TIMEOUT:-60} \
    --access-logfile - --error-logfile -"]
