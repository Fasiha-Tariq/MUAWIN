FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MUAWIN_HEADLESS=true

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN python -m pip install -r backend/requirements.txt \
    && python -m playwright install --with-deps chromium

COPY backend/ backend/
RUN mkdir -p backend/data backend/logs backend/outlines

EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn backend.server_ai:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
