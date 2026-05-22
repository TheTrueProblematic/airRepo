FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Chromium + driver are only needed if you intend to fall back to live UK
# G-INFO scraping inside Cloud Run. With the recommended seed-then-serve
# pattern (see MISC/setup.md) you can comment out this RUN block and
# remove `selenium` from requirements.txt to shrink the image by ~300MB.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        chromium-driver \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY airRepo.py app.py ./

# Production defaults:
#   - Firestore is the cache backend.
#   - Bulk ingestion never runs inside a user request; operator seeds via
#     seed.py beforehand (see MISC/setup.md). Override locally if needed.
#   - Logs go to /tmp (the only reliably writable path on Cloud Run).
ENV AIRREPO_BACKEND=firestore \
    AIRREPO_INGEST_ON_MISS=false \
    AIRREPO_LOG=/tmp/airrepo.log \
    PORT=8080

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "60", "app:app"]
