"""
URL configuration for config project.

Django is now an API-only backend (plus /admin/ and a couple of
non-JSON endpoints: CSV export, logout). Every other URL falls through
to the SPA catch-all, which serves the built React app and lets
React Router handle client-side routing.
"""
from django.contrib import admin
from django.urls import include, path, re_path

from .spa import spa_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('receipts.urls')),
    path('api/', include('transactions.urls')),
    path('api/', include('dashboard.api_urls')),
    path('api/auth/', include('accounts.api_urls')),
    path('', include('accounts.urls')),
    path('', include('dashboard.urls')),
    re_path(r'^.*$', spa_view),
]
