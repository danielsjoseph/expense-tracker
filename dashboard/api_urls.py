from django.urls import path

from .api_views import CategoryDetailSummaryView, DashboardSummaryView

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path(
        "dashboard/category/<str:category>/summary/",
        CategoryDetailSummaryView.as_view(),
        name="category-detail-summary",
    ),
]
