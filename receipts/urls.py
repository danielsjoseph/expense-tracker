from django.urls import path

from .views import ExtractReceiptView

urlpatterns = [
    path("extract/", ExtractReceiptView.as_view(), name="extract-receipt"),
]
