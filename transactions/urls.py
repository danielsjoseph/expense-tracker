from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CurrentMonthIncomeView, ExtraIncomeViewSet, TransactionViewSet

router = DefaultRouter()
router.register("transactions", TransactionViewSet, basename="transaction")
router.register("income/extra", ExtraIncomeViewSet, basename="extra-income")

urlpatterns = router.urls + [
    path("income/current/", CurrentMonthIncomeView.as_view(), name="current-income"),
]
