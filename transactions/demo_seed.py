import random
from datetime import timedelta

from django.utils import timezone

from receipts.ocr.categorize import CATEGORIES

from .models import MonthlyIncome, Transaction

DEMO_TRANSACTION_COUNT = 20
DEFAULT_SALARY = 500_000

# Rough per-category ranges (NGN) so seeded data looks plausible rather than
# uniformly random — e.g. Transport fares shouldn't land in Utilities' range.
_CATEGORY_AMOUNT_RANGES = {
    "Groceries": (2000, 25000),
    "Transport": (500, 8000),
    "Dining": (1500, 15000),
    "Utilities": (3000, 30000),
    "Entertainment": (1000, 12000),
    "Other": (500, 20000),
}


def seed_demo_transactions(user):
    """Give a brand-new account some sample data so the dashboard isn't
    empty on first login: 20 random transactions spread over the last 60
    days (so both the current-month daily chart and category breakdown
    have something to show), plus a default salary the user can edit
    later on the Update Income page."""
    today = timezone.localdate()
    transactions = [
        Transaction(
            user=user,
            amount=random.randint(*_CATEGORY_AMOUNT_RANGES[category]),
            currency="NGN",
            date=today - timedelta(days=random.randint(0, 59)),
            category=category,
        )
        for category in (random.choice(CATEGORIES) for _ in range(DEMO_TRANSACTION_COUNT))
    ]
    Transaction.objects.bulk_create(transactions)

    MonthlyIncome.objects.create(
        user=user,
        month=today.replace(day=1),
        amount=DEFAULT_SALARY,
        currency="NGN",
    )
