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

ENV PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=False

RUN python manage.py collectstatic --noinput

CMD python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
