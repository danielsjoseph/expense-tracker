from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .filters import TransactionFilter
from .models import ExtraIncome, MonthlyIncome, Transaction
from .serializers import (
    ExtraIncomeSerializer,
    IncomeInputSerializer,
    MonthlyIncomeSerializer,
    TransactionSerializer,
)


class TransactionPagination(PageNumberPagination):
    """10/page by default; the frontend's "see all" toggle requests a large
    page_size instead of a separate endpoint."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 10_000


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = TransactionFilter
    ordering_fields = ["date", "amount", "category", "created_at"]
    pagination_class = TransactionPagination

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())

        by_category = (
            queryset.values("category")
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )
        by_month = (
            queryset.annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(total=Sum("amount"))
            .order_by("month")
        )
        overall_total = queryset.aggregate(total=Sum("amount"))["total"] or 0

        return Response(
            {
                "total": overall_total,
                "by_category": list(by_category),
                "by_month": list(by_month),
            }
        )


class CurrentMonthIncomeView(APIView):
    """GET/POST the signed-in user's income for the current calendar month.
    POST upserts — one income figure per user per month."""

    def _lookup_kwargs(self, request):
        month = timezone.localdate().replace(day=1)
        return {"user": request.user, "month": month}

    def get(self, request):
        income = MonthlyIncome.objects.filter(**self._lookup_kwargs(request)).first()
        if income is None:
            month = self._lookup_kwargs(request)["month"]
            return Response({"month": month, "amount": 0, "currency": "NGN"})
        return Response(MonthlyIncomeSerializer(income).data)

    def post(self, request):
        input_serializer = IncomeInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        income, _ = MonthlyIncome.objects.update_or_create(
            defaults=input_serializer.validated_data,
            **self._lookup_kwargs(request),
        )
        return Response(MonthlyIncomeSerializer(income).data)


class ExtraIncomeViewSet(viewsets.ModelViewSet):
    """One-off 'extra money this month' entries — always scoped to the
    current calendar month. They add to the month's total income without
    touching the recurring MonthlyIncome (salary) figure."""

    serializer_class = ExtraIncomeSerializer

    def get_queryset(self):
        month = timezone.localdate().replace(day=1)
        return ExtraIncome.objects.filter(user=self.request.user, month=month)

    def perform_create(self, serializer):
        month = timezone.localdate().replace(day=1)
        serializer.save(user=self.request.user, month=month)
