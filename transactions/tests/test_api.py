from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from transactions.models import ExtraIncome, MonthlyIncome, Transaction

User = get_user_model()


class AuthenticatedApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="user@example.com", email="user@example.com")
        self.client = APIClient()
        self.client.force_login(self.user)


class TransactionApiTests(AuthenticatedApiTestCase):
    def test_create_and_list_transaction(self):
        payload = {
            "amount": "10.50",
            "currency": "NGN",
            "date": "2024-03-15",
            "category": "Groceries",
        }
        create_response = self.client.post("/api/transactions/", payload)
        self.assertEqual(create_response.status_code, 201)

        list_response = self.client.get("/api/transactions/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["count"], 1)

    def test_rejects_category_outside_fixed_choices(self):
        payload = {
            "amount": "10.50",
            "currency": "NGN",
            "date": "2024-03-15",
            "category": "NotARealCategory",
        }
        response = self.client.post("/api/transactions/", payload)
        self.assertEqual(response.status_code, 400)

    def test_rejects_currency_outside_fixed_choices(self):
        payload = {
            "amount": "10.50",
            "currency": "JPY",
            "date": "2024-03-15",
            "category": "Groceries",
        }
        response = self.client.post("/api/transactions/", payload)
        self.assertEqual(response.status_code, 400)

    def test_filter_by_category_and_date_range(self):
        Transaction.objects.create(
            user=self.user, amount="10.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        Transaction.objects.create(
            user=self.user, amount="5.00", currency="NGN", date="2024-04-01", category="Transport"
        )

        response = self.client.get("/api/transactions/", {"category": "groceries"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["category"], "Groceries")

        response = self.client.get(
            "/api/transactions/", {"date_from": "2024-03-15", "date_to": "2024-04-30"}
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["category"], "Transport")

    def test_summary_aggregates_by_category_and_month(self):
        Transaction.objects.create(
            user=self.user, amount="10.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        Transaction.objects.create(
            user=self.user, amount="5.00", currency="NGN", date="2024-03-15", category="Groceries"
        )

        response = self.client.get("/api/transactions/summary/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(float(response.data["total"]), 15.0)
        self.assertEqual(len(response.data["by_category"]), 1)
        self.assertEqual(response.data["by_category"][0]["category"], "Groceries")

    def test_only_sees_own_transactions(self):
        other_user = User.objects.create_user(username="other@example.com")
        Transaction.objects.create(
            user=other_user, amount="99.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        response = self.client.get("/api/transactions/")
        self.assertEqual(response.data["count"], 0)


class TransactionModelTests(TestCase):
    def test_string_representation(self):
        txn = Transaction(amount="10.50", currency="NGN", date="2024-03-15", category="Groceries")
        self.assertEqual(str(txn), "10.50 NGN (2024-03-15) - Groceries")

    def test_defaults_to_other_category(self):
        txn = Transaction.objects.create(amount="10.50", currency="NGN", date="2024-03-15")
        self.assertEqual(txn.category, "Other")


class CurrentMonthIncomeApiTests(AuthenticatedApiTestCase):
    def test_get_returns_zero_when_unset(self):
        response = self.client.get("/api/income/current/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(float(response.data["amount"]), 0)

    def test_post_creates_then_updates_same_month_row(self):
        first = self.client.post("/api/income/current/", {"amount": "1000.00"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(float(first.data["amount"]), 1000.0)

        second = self.client.post("/api/income/current/", {"amount": "1500.00"})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(float(second.data["amount"]), 1500.0)

        # upsert, not insert — still exactly one row for this month
        self.assertEqual(
            MonthlyIncome.objects.filter(
                user=self.user, month=timezone.localdate().replace(day=1)
            ).count(),
            1,
        )


class ExtraIncomeApiTests(AuthenticatedApiTestCase):
    def test_create_lists_and_stamps_current_month(self):
        response = self.client.post(
            "/api/income/extra/", {"amount": "50.00", "description": "side gig"}
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["month"], str(timezone.localdate().replace(day=1)))

        list_response = self.client.get("/api/income/extra/")
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(list_response.data["results"][0]["description"], "side gig")

    def test_creating_extra_income_does_not_change_base_salary(self):
        self.client.post("/api/income/current/", {"amount": "1000.00"})
        self.client.post("/api/income/extra/", {"amount": "200.00"})

        base_income = self.client.get("/api/income/current/")
        self.assertEqual(float(base_income.data["amount"]), 1000.0)

    def test_delete_removes_entry(self):
        create = self.client.post("/api/income/extra/", {"amount": "50.00"})
        entry_id = create.data["id"]

        delete_response = self.client.delete(f"/api/income/extra/{entry_id}/")
        self.assertEqual(delete_response.status_code, 204)
        self.assertEqual(ExtraIncome.objects.count(), 0)

    def test_only_lists_current_months_entries(self):
        ExtraIncome.objects.create(user=self.user, amount="10.00", month=date(2020, 1, 1))
        response = self.client.get("/api/income/extra/")
        self.assertEqual(response.data["count"], 0)
