from django.db.models import Sum
from django.http import Http404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from transactions.choices import CATEGORIES
from transactions.models import Transaction

from .views import (
    _base_income,
    _category_breakdown,
    _daily_spend_this_month,
    _extra_income_total,
    _filtered_queryset,
    _income_vs_spent_breakdown,
    _round2,
)


class DashboardSummaryView(APIView):
    """Everything the dashboard page needs in one call: the filtered total,
    the current-month daily chart, the income-vs-spent breakdown, and the
    category breakdown (which deliberately ignores the category filter —
    see _category_breakdown). Transactions themselves are fetched
    separately via /api/transactions/, which already supports the same
    category/date_from/date_to filters plus pagination."""

    def get(self, request):
        queryset = _filtered_queryset(request)
        total = _round2(queryset.aggregate(total=Sum("amount"))["total"] or 0)
        day_labels, day_totals = _daily_spend_this_month(request)

        month_start = timezone.localdate().replace(day=1)
        this_month_spent = _round2(
            Transaction.objects.filter(user=request.user, date__gte=month_start).aggregate(
                total=Sum("amount")
            )["total"]
            or 0
        )
        base_income = _base_income(request)
        extra_income = _extra_income_total(request)
        total_income = base_income + extra_income
        pie_labels, pie_totals = _income_vs_spent_breakdown(total_income, this_month_spent)
        category_labels, category_totals = _category_breakdown(request)

        return Response(
            {
                "total": total,
                "day_labels": day_labels,
                "day_totals": day_totals,
                "income_pie_labels": pie_labels,
                "income_pie_totals": pie_totals,
                "category_chart_labels": category_labels,
                "category_chart_totals": category_totals,
                "categories": CATEGORIES,
                "monthly_income": total_income,
                "base_income": base_income,
                "extra_income": extra_income,
                "month_spent": this_month_spent,
                "month_remaining": total_income - this_month_spent,
            }
        )


class CategoryDetailSummaryView(APIView):
    """The breakdown a clicked chart slice leads to: this category's total
    (respecting date range) plus the same all-category chart data as the
    dashboard, so the detail page can highlight this slice among all of
    them rather than showing a collapsed single-slice chart."""

    def get(self, request, category):
        if category not in CATEGORIES:
            raise Http404("Unknown category")

        queryset = Transaction.objects.filter(user=request.user, category=category)
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        total = _round2(queryset.aggregate(total=Sum("amount"))["total"] or 0)
        category_labels, category_totals = _category_breakdown(request)

        return Response(
            {
                "category": category,
                "total": total,
                "category_chart_labels": category_labels,
                "category_chart_totals": category_totals,
            }
        )
