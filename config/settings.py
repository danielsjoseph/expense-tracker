"""
Django settings for config project.

This app has no backend data model or accounts at all — every
transaction/income record lives in the browser (IndexedDB), and OCR runs
client-side too. Django's only remaining job is to serve the built React
app (frontend/dist) as static files, via the catch-all in config.spa.
There is deliberately no DATABASES entry, no auth/sessions/admin, and no
API framework — none of it has anything left to do.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-^knzu%gq@5e53f_vjrjaw&rlh+ko7$xey$g_ub3j)^fvjkfd6*",
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get("DJANGO_DEBUG", "True") == "True"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

# Render assigns each service a hostname at deploy time and exposes it via
# this env var — trust it automatically instead of requiring it to be
# hardcoded into DJANGO_ALLOWED_HOSTS.
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)


# Application definition

INSTALLED_APPS = [
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# No database — nothing in this project uses Django's ORM.
DATABASES = {}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# The built React app (frontend/npm run build) is served straight from its
# own dist/ dir at the URL root via WhiteNoise, decoupled from Django's own
# /static/ and its collectstatic/manifest machinery — Vite already
# content-hashes its own filenames. index.html itself is deliberately NOT
# auto-served here (WHITENOISE_INDEX_FILE stays off); config.spa.spa_view
# serves it instead.
_FRONTEND_DIST = BASE_DIR / 'frontend' / 'dist'
if _FRONTEND_DIST.exists():
    WHITENOISE_ROOT = _FRONTEND_DIST

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
