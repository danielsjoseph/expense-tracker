from pathlib import Path

from django.conf import settings
from django.http import HttpResponse

FRONTEND_INDEX = Path(settings.BASE_DIR) / "frontend" / "dist" / "index.html"


def spa_view(request):
    """Serves the built React app's shell for every URL — client-side
    routing (React Router) takes it from there. There's no server-side
    session or CSRF concern anymore: the app makes no requests back to
    Django at all (all data lives in the browser's IndexedDB)."""
    if not FRONTEND_INDEX.exists():
        return HttpResponse(
            "Frontend not built yet. Run `npm install && npm run build` inside frontend/.",
            status=501,
        )
    return HttpResponse(FRONTEND_INDEX.read_text(encoding="utf-8"))
