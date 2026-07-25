from django.urls import path

from . import views

urlpatterns = [
    path("export/csv/", views.export_csv_view, name="export-csv"),
]
