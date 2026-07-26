from django.conf import settings
from django.db import models

from .choices import CATEGORIES, CURRENCIES

CATEGORY_CHOICES = [(category, category) for category in CATEGORIES]
CURRENCY_CHOICES = [(currency, currency) for currency in CURRENCIES]


class Transaction(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="transactions",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default="NGN")
    date = models.DateField()
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default="Other")
    raw_ocr_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.amount} {self.currency} ({self.date}) - {self.category}"


class MonthlyIncome(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="incomes",
    )
    month = models.DateField(help_text="Normalized to the 1st of the month.")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default="NGN")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month"]

    def save(self, *args, **kwargs):
        self.month = self.month.replace(day=1)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Income {self.month:%Y-%m}: {self.amount} {self.currency}"


class ExtraIncome(models.Model):
    """One-off extra money received in a given month (a gift, side gig,
    bonus, etc.) — adds to that month's total income without changing the
    recurring MonthlyIncome (salary) figure."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="extra_incomes",
    )
    month = models.DateField(help_text="Normalized to the 1st of the month.")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default="NGN")
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        self.month = self.month.replace(day=1)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Extra income {self.month:%Y-%m}: {self.amount} {self.currency}"
