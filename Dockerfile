FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim

# tesseract-ocr provides the OCR binary; libgl1/libglib2.0-0 satisfy
# opencv-python-headless's runtime shared-library requirements.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=False

RUN python manage.py collectstatic --noinput

# --timeout 120: OCR-extracting a batch of receipts is CPU-heavy and can
# take longer than gunicorn's 30s default, which was killing the worker
# mid-request on a batch of several images (surfaced to users as "Could not
# reach the server"). Images are now downscaled before OCR too (see
# receipts/ocr/preprocessing.py) — this timeout is a safety margin on top of
# that, not a substitute for it.
CMD python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --timeout 120
