FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=False

RUN python manage.py collectstatic --noinput

# --timeout 120: a generous safety margin over gunicorn's 30s default (e.g.
# for a large CSV export, or a slow response from the email API) now that
# OCR — the original reason this was raised — runs client-side and no
# longer does CPU-heavy work in the request/response cycle at all.
CMD python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --timeout 120
