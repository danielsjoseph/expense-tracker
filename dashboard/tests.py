from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from transactions.models import ExtraIncome, MonthlyIncome, Transaction

User = get_user_model()


class AuthenticatedTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="user@example.com", email="user@example.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)


class ExportCsvViewTests(TestCase):
    """The CSV export stays a plain Django view (a file download, not
    JSON), so it uses session auth via force_login rather than the DRF
    APIClient's force_authenticate."""

    def setUp(self):
        self.user = User.objects.create_user(username="user@example.com", email="user@example.com")
        self.client.force_login(self.user)

    def test_amounts_are_comma_formatted_and_total_row_is_appended(self):
        Transaction.objects.create(
            user=self.user, amount="1234.50", currency="NGN", date="2024-03-01", category="Groceries"
        )
        Transaction.objects.create(
            user=self.user, amount="10.00", currency="NGN", date="2024-03-15", category="Transport"
        )

        response = self.client.get("/export/csv/")
        content = response.content.decode()

        self.assertIn('"1,234.50"', content)
        self.assertIn("10.00", content)
        self.assertIn("Total Expense", content)
        self.assertIn('"1,244.50"', content)


class DashboardSummaryViewTests(AuthenticatedTestCase):
    def test_shows_combined_income(self):
        month = timezone.localdate().replace(day=1)
        MonthlyIncome.objects.create(user=self.user, month=month, amount="1000.00")
        ExtraIncome.objects.create(user=self.user, month=month, amount="200.00")

        response = self.client.get("/api/dashboard/summary/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(float(response.data["monthly_income"]), 1200.0)
        self.assertEqual(float(response.data["base_income"]), 1000.0)
        self.assertEqual(float(response.data["extra_income"]), 200.0)

    def test_requires_authentication(self):
        anon_client = APIClient()
        response = anon_client.get("/api/dashboard/summary/")
        self.assertEqual(response.status_code, 403)


class TransactionPaginationTests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        for i in range(15):
            Transaction.objects.create(
                user=self.user,
                amount="10.00",
                currency="NGN",
                date=f"2024-01-{i + 1:02d}",
                category="Groceries",
            )

    def test_default_page_shows_ten(self):
        response = self.client.get("/api/transactions/")
        self.assertEqual(len(response.data["results"]), 10)
        self.assertEqual(response.data["count"], 15)
        self.assertIsNotNone(response.data["next"])
        self.assertIsNone(response.data["previous"])

    def test_second_page_shows_remaining_five(self):
        response = self.client.get("/api/transactions/", {"page": 2})
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["previous"])

    def test_large_page_size_shows_every_transaction(self):
        response = self.client.get("/api/transactions/", {"page_size": 1000})
        self.assertEqual(len(response.data["results"]), 15)
        self.assertIsNone(response.data["next"])


class DashboardDailyChartTests(AuthenticatedTestCase):
    def test_chart_covers_first_of_month_through_today_with_zero_fill(self):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        Transaction.objects.create(
            user=self.user, amount="25.00", currency="NGN", date=today, category="Groceries"
        )

        response = self.client.get("/api/dashboard/summary/")

        expected_days = (today - month_start).days + 1
        self.assertEqual(len(response.data["day_labels"]), expected_days)
        self.assertEqual(len(response.data["day_totals"]), expected_days)
        self.assertEqual(response.data["day_totals"][-1], 25.0)
        # every day before today had no transactions, so it must be zero-filled
        self.assertTrue(all(v == 0 for v in response.data["day_totals"][:-1]))

    def test_ignores_transactions_outside_current_month(self):
        Transaction.objects.create(
            user=self.user, amount="999.00", currency="NGN", date="2020-01-01", category="Groceries"
        )
        response = self.client.get("/api/dashboard/summary/")
        self.assertEqual(sum(response.data["day_totals"]), 0)


class CategoryBreakdownChartTests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        Transaction.objects.create(
            user=self.user, amount="30.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        Transaction.objects.create(
            user=self.user, amount="20.00", currency="NGN", date="2024-03-02", category="Transport"
        )

    def test_chart_includes_all_categories_regardless_of_active_category_filter(self):
        # This is the whole point of the click-to-filter chart: filtering the
        # table to one category must not collapse the chart to a single
        # slice, or you'd lose the context you clicked it for.
        response = self.client.get("/api/dashboard/summary/", {"category": "Transport"})

        labels = response.data["category_chart_labels"]
        totals = response.data["category_chart_totals"]
        self.assertIn("Groceries", labels)
        self.assertIn("Transport", labels)
        self.assertEqual(totals[labels.index("Groceries")], 30.0)
        self.assertEqual(totals[labels.index("Transport")], 20.0)

        # but the transaction list itself IS filtered
        table_response = self.client.get("/api/transactions/", {"category": "Transport"})
        self.assertEqual(table_response.data["count"], 1)

    def test_chart_respects_date_range_filter(self):
        response = self.client.get("/api/dashboard/summary/", {"date_from": "2024-03-02"})

        labels = response.data["category_chart_labels"]
        self.assertNotIn("Groceries", labels)
        self.assertIn("Transport", labels)


class CategoryDetailSummaryViewTests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        Transaction.objects.create(
            user=self.user, amount="30.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        Transaction.objects.create(
            user=self.user, amount="15.00", currency="NGN", date="2024-03-15", category="Groceries"
        )
        Transaction.objects.create(
            user=self.user, amount="20.00", currency="NGN", date="2024-03-02", category="Transport"
        )

    def test_shows_only_that_categorys_total(self):
        response = self.client.get("/api/dashboard/category/Groceries/summary/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(float(response.data["total"]), 45.0)
        self.assertEqual(response.data["category"], "Groceries")

    def test_unknown_category_404s(self):
        response = self.client.get("/api/dashboard/category/NotARealCategory/summary/")
        self.assertEqual(response.status_code, 404)

    def test_chart_includes_every_category_not_just_this_one(self):
        response = self.client.get("/api/dashboard/category/Groceries/summary/")
        labels = response.data["category_chart_labels"]
        totals = response.data["category_chart_totals"]
        self.assertIn("Groceries", labels)
        self.assertIn("Transport", labels)
        self.assertEqual(totals[labels.index("Groceries")], 45.0)
        self.assertEqual(totals[labels.index("Transport")], 20.0)

    def test_respects_date_range_query_params(self):
        response = self.client.get(
            "/api/dashboard/category/Groceries/summary/", {"date_from": "2024-03-10"}
        )
        self.assertEqual(float(response.data["total"]), 15.0)

        table_response = self.client.get(
            "/api/transactions/", {"category": "Groceries", "date_from": "2024-03-10"}
        )
        self.assertEqual(table_response.data["count"], 1)

    def test_only_totals_own_transactions(self):
        other_user = User.objects.create_user(username="other@example.com")
        Transaction.objects.create(
            user=other_user, amount="999.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        response = self.client.get("/api/dashboard/category/Groceries/summary/")
        self.assertEqual(float(response.data["total"]), 45.0)  # not 1044.00

    def test_requires_authentication(self):
        anon_client = APIClient()
        response = anon_client.get("/api/dashboard/category/Groceries/summary/")
        self.assertEqual(response.status_code, 403)


class SpaShellTests(TestCase):
    """Django no longer gates page routes itself — the SPA shell is the same
    static HTML for everyone, and it's client-side (React Router + the
    /api/auth/me/ check) that decides what to render. These just confirm
    the catch-all route exists and never redirects, for both anonymous and
    authenticated visitors, regardless of whether the frontend has been
    built in this environment (a fresh checkout without `npm run build` yet
    gets a 501 placeholder rather than a crash)."""

    def _assert_serves_shell_without_redirect(self, path):
        response = self.client.get(path)
        self.assertIn(response.status_code, (200, 501))

    def test_public_and_app_routes_serve_the_shell_when_logged_out(self):
        for path in ["/", "/login/", "/dashboard/", "/expenses/", "/income/"]:
            self._assert_serves_shell_without_redirect(path)

    def test_app_routes_serve_the_shell_when_logged_in(self):
        user = User.objects.create_user(username="user@example.com")
        self.client.force_login(user)
        for path in ["/", "/dashboard/", "/expenses/", "/income/"]:
            self._assert_serves_shell_without_redirect(path)
