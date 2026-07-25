from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from transactions.models import ExtraIncome, MonthlyIncome, Transaction

User = get_user_model()


class AuthenticatedTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="user@example.com", email="user@example.com")
        self.client.force_login(self.user)


class ExportCsvViewTests(AuthenticatedTestCase):
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


class RenamedRoutesTests(AuthenticatedTestCase):
    def test_expenses_page_replaces_upload_page(self):
        response = self.client.get("/expenses/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Add an expense manually")

        response = self.client.get("/upload/")
        self.assertEqual(response.status_code, 404)

    def test_income_page_shows_salary_and_extra_income_sections(self):
        response = self.client.get("/income/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Update monthly salary")
        self.assertContains(response, "Add extra income this month")

    def test_dashboard_shows_combined_income(self):
        month = timezone.localdate().replace(day=1)
        MonthlyIncome.objects.create(user=self.user, month=month, amount="1000.00")
        ExtraIncome.objects.create(user=self.user, month=month, amount="200.00")

        response = self.client.get("/dashboard/")
        self.assertContains(response, "1,200.00")


class DashboardPaginationTests(AuthenticatedTestCase):
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

    def test_default_page_shows_ten_and_pagination_controls(self):
        response = self.client.get("/dashboard/")
        self.assertEqual(len(response.context["transactions"]), 10)
        self.assertContains(response, "Page 1 of 2")
        self.assertContains(response, "See all transactions")
        self.assertContains(response, "Next")
        self.assertNotContains(response, "Previous")

    def test_second_page_shows_remaining_five(self):
        response = self.client.get("/dashboard/", {"page": 2})
        self.assertEqual(len(response.context["transactions"]), 5)
        self.assertContains(response, "Previous")
        self.assertNotContains(response, ">Next<")

    def test_see_all_button_shows_every_transaction_on_one_page(self):
        response = self.client.get("/dashboard/", {"all": "1"})
        self.assertEqual(len(response.context["transactions"]), 15)
        self.assertContains(response, "Showing all 15 transaction(s)")
        self.assertContains(response, "Paginate (10 per page)")


class DashboardDailyChartTests(AuthenticatedTestCase):
    def test_chart_covers_first_of_month_through_today_with_zero_fill(self):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        Transaction.objects.create(
            user=self.user, amount="25.00", currency="NGN", date=today, category="Groceries"
        )

        response = self.client.get("/dashboard/")

        expected_days = (today - month_start).days + 1
        self.assertEqual(len(response.context["day_labels"]), expected_days)
        self.assertEqual(len(response.context["day_totals"]), expected_days)
        self.assertEqual(response.context["day_totals"][-1], 25.0)
        # every day before today had no transactions, so it must be zero-filled
        self.assertTrue(all(v == 0 for v in response.context["day_totals"][:-1]))

    def test_ignores_transactions_outside_current_month(self):
        Transaction.objects.create(
            user=self.user, amount="999.00", currency="NGN", date="2020-01-01", category="Groceries"
        )
        response = self.client.get("/dashboard/")
        self.assertEqual(sum(response.context["day_totals"]), 0)


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
        # table to one category must not collapse the chart to a single slice,
        # or you'd lose the context you clicked it for.
        response = self.client.get("/dashboard/", {"category": "Transport"})

        labels = response.context["category_chart_labels"]
        totals = response.context["category_chart_totals"]
        self.assertIn("Groceries", labels)
        self.assertIn("Transport", labels)
        self.assertEqual(totals[labels.index("Groceries")], 30.0)
        self.assertEqual(totals[labels.index("Transport")], 20.0)

        # but the transaction table itself IS filtered
        self.assertEqual(len(response.context["transactions"]), 1)

    def test_chart_respects_date_range_filter(self):
        response = self.client.get("/dashboard/", {"date_from": "2024-03-02"})

        labels = response.context["category_chart_labels"]
        self.assertNotIn("Groceries", labels)
        self.assertIn("Transport", labels)

    def test_clear_category_qs_drops_category_but_keeps_date_filters(self):
        response = self.client.get(
            "/dashboard/", {"category": "Transport", "date_from": "2024-03-01"}
        )
        clear_qs = response.context["clear_category_qs"]
        self.assertNotIn("category", clear_qs)
        self.assertIn("date_from", clear_qs)


class CategoryDetailPageTests(AuthenticatedTestCase):
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

    def test_shows_only_that_categorys_transactions_and_total(self):
        response = self.client.get("/dashboard/category/Groceries/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.context["transactions"]), 2)
        self.assertEqual(float(response.context["total"]), 45.0)
        self.assertContains(response, "Groceries")
        self.assertNotContains(response, "20.00")  # the Transport row

    def test_unknown_category_404s(self):
        response = self.client.get("/dashboard/category/NotARealCategory/")
        self.assertEqual(response.status_code, 404)

    def test_chart_includes_every_category_not_just_this_one(self):
        response = self.client.get("/dashboard/category/Groceries/")
        labels = response.context["category_chart_labels"]
        totals = response.context["category_chart_totals"]
        self.assertIn("Groceries", labels)
        self.assertIn("Transport", labels)
        self.assertEqual(totals[labels.index("Groceries")], 45.0)
        self.assertEqual(totals[labels.index("Transport")], 20.0)

    def test_respects_date_range_query_params(self):
        response = self.client.get(
            "/dashboard/category/Groceries/", {"date_from": "2024-03-10"}
        )
        self.assertEqual(len(response.context["transactions"]), 1)
        self.assertEqual(float(response.context["total"]), 15.0)

    def test_only_shows_own_transactions(self):
        other_user = User.objects.create_user(username="other@example.com")
        Transaction.objects.create(
            user=other_user, amount="999.00", currency="NGN", date="2024-03-01", category="Groceries"
        )
        response = self.client.get("/dashboard/category/Groceries/")
        self.assertEqual(len(response.context["transactions"]), 2)  # not 3

    def test_requires_login(self):
        self.client.logout()
        response = self.client.get("/dashboard/category/Groceries/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/", response.url)


class LoginGateTests(TestCase):
    def test_anonymous_visitor_redirected_to_login(self):
        for url in ["/dashboard/", "/expenses/", "/income/"]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
            self.assertIn("/login/", response.url)


class HomePageTests(TestCase):
    def test_public_homepage_is_accessible_when_logged_out(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Log in to get started")

    def test_logged_in_visitor_is_redirected_to_dashboard(self):
        user = User.objects.create_user(username="user@example.com")
        self.client.force_login(user)
        response = self.client.get("/")
        self.assertRedirects(response, "/dashboard/")
