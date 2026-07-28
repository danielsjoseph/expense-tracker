"""
URL configuration for config project.

Everything is client-side now — there is no API, no admin, no accounts.
Every URL falls through to the SPA catch-all, which serves the built
React app and lets React Router handle routing entirely in the browser.
"""
from django.urls import re_path

from .spa import spa_view

urlpatterns = [
    re_path(r'^.*$', spa_view),
]
