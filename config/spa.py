from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie

FRONTEND_INDEX = Path(settings.BASE_DIR) / "frontend" / "dist" / "index.html"


@ensure_csrf_cookie
def spa_view(request):
    """Serves the built React app's shell for every non-API/non-admin URL —
    client-side routing (React Router) takes it from there. Every page load
    goes through here, so this is also where the csrftoken cookie gets set
    for the SPA's fetch calls to pick up."""
    if not FRONTEND_INDEX.exists():
        return HttpResponse(
            "Frontend not built yet. Run `npm install && npm run build` inside frontend/.",
            status=501,
        )
    return HttpResponse(FRONTEND_INDEX.read_text(encoding="utf-8"))
