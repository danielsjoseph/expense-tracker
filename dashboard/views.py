import csv
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import Sum
from django.http import HttpResponse
from django.utils import timezone

from transactions.models import ExtraIncome, MonthlyIncome, Transaction


def _round2(value):
    """SQLite's SUM() introduces binary-float noise (e.g. 147594.0600000001)
    that Django's Decimal conversion preserves verbatim. Round every
    aggregated money figure back to 2 decimal places before it's displayed."""
    return round(value, 2)


def _filtered_queryset(request):
    queryset = Transaction.objects.filter(user=request.user)

    category = request.GET.get("category")
    date_from = request.GET.get("date_from")
    date_to = request.GET.get("date_to")

    if category:
        queryset = queryset.filter(category__iexact=category)
    if date_from:
        queryset = queryset.filter(date__gte=date_from)
    if date_to:
        queryset = queryset.filter(date__lte=date_to)

    return queryset


def _base_income(request):
    """The recurring monthly salary figure, set on the Update Income page."""
    month = timezone.localdate().replace(day=1)
    income = MonthlyIncome.objects.filter(user=request.user, month=month).first()
    return income.amount if income else 0


def _extra_income_total(request):
    """One-off extra money received this month — adds to total income
    without changing the recurring base salary figure."""
    month = timezone.localdate().replace(day=1)
    total = (
        ExtraIncome.objects.filter(user=request.user, month=month).aggregate(total=Sum("amount"))[
            "total"
        ]
        or 0
    )
    return _round2(total)


def _daily_spend_this_month(request):
    """Day-by-day spend for the current calendar month, 1st through today.
    Days with no transactions are filled with 0 so the chart shows the
    actual daily pattern instead of skipping straight to the next entry."""
    today = timezone.localdate()
    month_start = today.replace(day=1)

    totals_by_day = dict(
        Transaction.objects.filter(user=request.user, date__gte=month_start, date__lte=today)
        .values("date")
        .annotate(total=Sum("amount"))
        .values_list("date", "total")
    )

    labels = []
    totals = []
    day = month_start
    while day <= today:
        labels.append(day.strftime("%b %d"))
        totals.append(float(_round2(totals_by_day.get(day, 0))))
        day += timedelta(days=1)

    return labels, totals


def _category_breakdown(request):
    """Spend by category, respecting the date range filter but deliberately
    NOT the category filter itself — otherwise clicking a slice to filter
    the table down to one category would collapse the chart to a single
    100% slice on the next load, destroying the context you clicked for."""
    queryset = Transaction.objects.filter(user=request.user)
    date_from = request.GET.get("date_from")
    date_to = request.GET.get("date_to")
    if date_from:
        queryset = queryset.filter(date__gte=date_from)
    if date_to:
        queryset = queryset.filter(date__lte=date_to)

    rows = (
        queryset.values("category")
        .annotate(total=Sum("amount"))
        .order_by("-total")
    )
    labels = [row["category"] or "Uncategorized" for row in rows]
    totals = [float(_round2(row["total"])) for row in rows]
    return labels, totals


def _income_vs_spent_breakdown(income, spent):
    income = float(income)
    spent = float(spent)

    if income <= 0:
        return (["Spent"], [spent]) if spent > 0 else ([], [])

    spent_within_income = min(spent, income)
    remaining = max(income - spent, 0)
    overspent = max(spent - income, 0)

    labels = ["Spent", "Remaining"]
    values = [spent_within_income, remaining]
    if overspent > 0:
        labels.append("Over budget")
        values.append(overspent)
    return labels, values


@login_required
def export_csv_view(request):
    queryset = _filtered_queryset(request)

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="transactions.csv"'

    writer = csv.writer(response)
    writer.writerow(["Date", "Amount", "Currency", "Category"])

    total = Decimal("0")
    for txn in queryset:
        writer.writerow([txn.date, f"{txn.amount:,.2f}", txn.currency, txn.category])
        total += txn.amount

    writer.writerow([])
    writer.writerow(["Total Expense", f"{total:,.2f}", "", ""])

    return response
