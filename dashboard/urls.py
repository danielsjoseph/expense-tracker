from django.urls import path

from . import views

urlpatterns = [
    path("", views.home_view, name="home"),
    path("dashboard/", views.dashboard_view, name="dashboard"),
    path("dashboard/category/<str:category>/", views.category_detail_view, name="category-detail"),
    path("expenses/", views.expenses_view, name="expenses"),
    path("income/", views.income_view, name="income"),
    path("export/csv/", views.export_csv_view, name="export-csv"),
]
