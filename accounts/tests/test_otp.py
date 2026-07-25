import re
import socket
from datetime import timedelta
from smtplib import SMTPAuthenticationError
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import MAX_ATTEMPTS, LoginOTP
from accounts.views import MAX_SEND_ATTEMPTS
from transactions.demo_seed import DEFAULT_SALARY, DEMO_TRANSACTION_COUNT
from transactions.models import MonthlyIncome, Transaction

User = get_user_model()


class LoginOTPModelTests(TestCase):
    def test_issue_returns_matching_code_and_hash(self):
        otp, code = LoginOTP.issue("user@example.com")
        self.assertRegex(code, r"^\d{6}$")
        self.assertTrue(otp.verify(code))

    def test_issuing_a_new_code_invalidates_the_previous_one(self):
        first_otp, first_code = LoginOTP.issue("user@example.com")
        _second_otp, _second_code = LoginOTP.issue("user@example.com")

        first_otp.refresh_from_db()
        self.assertTrue(first_otp.used)

    def test_wrong_code_fails_and_consumes_an_attempt(self):
        otp, _code = LoginOTP.issue("user@example.com")
        self.assertFalse(otp.verify("000000"))
        self.assertEqual(otp.attempts, 1)

    def test_code_cannot_be_reused_after_success(self):
        otp, code = LoginOTP.issue("user@example.com")
        self.assertTrue(otp.verify(code))
        self.assertFalse(otp.verify(code))

    def test_expired_code_is_rejected(self):
        otp, code = LoginOTP.issue("user@example.com")
        otp.expires_at = timezone.now() - timedelta(seconds=1)
        otp.save(update_fields=["expires_at"])
        self.assertFalse(otp.verify(code))

    def test_locks_out_after_max_attempts(self):
        otp, code = LoginOTP.issue("user@example.com")
        for _ in range(MAX_ATTEMPTS):
            otp.verify("000000")
        self.assertFalse(otp.verify(code))  # correct code, but attempts exhausted


class RequestOtpViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_sends_email_with_six_digit_code(self):
        response = self.client.post("/api/auth/request-otp/", {"email": "user@example.com"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["user@example.com"])
        self.assertRegex(mail.outbox[0].body, r"\b\d{6}\b")

    def test_rejects_invalid_email(self):
        response = self.client.post("/api/auth/request-otp/", {"email": "not-an-email"})
        self.assertEqual(response.status_code, 400)

    def test_accessible_without_authentication(self):
        # The global DRF default is IsAuthenticated; this endpoint must
        # override that, since it's part of the login mechanism itself.
        response = self.client.post("/api/auth/request-otp/", {"email": "user@example.com"})
        self.assertNotEqual(response.status_code, 403)


class RequestOtpRetryTests(TestCase):
    """The DNS-failure case reported in practice: getaddrinfo failed. These
    mock send_mail/time.sleep directly so the tests stay fast and don't
    depend on real network conditions."""

    def setUp(self):
        self.client = APIClient()

    @patch("accounts.views.time.sleep")
    @patch("accounts.views.send_mail")
    def test_retries_on_transient_dns_error_then_succeeds(self, mock_send_mail, mock_sleep):
        mock_send_mail.side_effect = [socket.gaierror("[Errno 11001] getaddrinfo failed"), None]

        response = self.client.post("/api/auth/request-otp/", {"email": "user@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_send_mail.call_count, 2)
        mock_sleep.assert_called_once()

    @patch("accounts.views.time.sleep")
    @patch("accounts.views.send_mail")
    def test_gives_up_after_max_attempts_on_persistent_dns_error(self, mock_send_mail, mock_sleep):
        mock_send_mail.side_effect = socket.gaierror("[Errno 11001] getaddrinfo failed")

        response = self.client.post("/api/auth/request-otp/", {"email": "user@example.com"})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(mock_send_mail.call_count, MAX_SEND_ATTEMPTS)
        self.assertEqual(mock_sleep.call_count, MAX_SEND_ATTEMPTS - 1)

    @patch("accounts.views.time.sleep")
    @patch("accounts.views.send_mail")
    def test_does_not_retry_permanent_auth_error(self, mock_send_mail, mock_sleep):
        mock_send_mail.side_effect = SMTPAuthenticationError(535, b"5.7.8 Bad credentials")

        response = self.client.post("/api/auth/request-otp/", {"email": "user@example.com"})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(mock_send_mail.call_count, 1)  # no retry — retrying can't fix bad auth
        mock_sleep.assert_not_called()


class VerifyOtpViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _code_from_outbox(self):
        match = re.search(r"\b(\d{6})\b", mail.outbox[-1].body)
        return match.group(1)

    def test_correct_code_logs_in_and_creates_user(self):
        self.assertEqual(User.objects.count(), 0)
        self.client.post("/api/auth/request-otp/", {"email": "new@example.com"})
        code = self._code_from_outbox()

        response = self.client.post(
            "/api/auth/verify-otp/", {"email": "new@example.com", "code": code}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(username="new@example.com").count(), 1)

        # session is now authenticated
        dashboard_response = self.client.get("/dashboard/")
        self.assertEqual(dashboard_response.status_code, 200)

    def test_existing_user_is_not_duplicated(self):
        User.objects.create_user(username="existing@example.com", email="existing@example.com")
        self.client.post("/api/auth/request-otp/", {"email": "existing@example.com"})
        code = self._code_from_outbox()

        self.client.post("/api/auth/verify-otp/", {"email": "existing@example.com", "code": code})
        self.assertEqual(User.objects.filter(username="existing@example.com").count(), 1)

    def test_new_user_gets_seeded_with_demo_transactions(self):
        self.client.post("/api/auth/request-otp/", {"email": "new@example.com"})
        code = self._code_from_outbox()

        self.client.post("/api/auth/verify-otp/", {"email": "new@example.com", "code": code})

        user = User.objects.get(username="new@example.com")
        self.assertEqual(Transaction.objects.filter(user=user).count(), DEMO_TRANSACTION_COUNT)

    def test_new_user_gets_default_salary(self):
        self.client.post("/api/auth/request-otp/", {"email": "new@example.com"})
        code = self._code_from_outbox()

        self.client.post("/api/auth/verify-otp/", {"email": "new@example.com", "code": code})

        user = User.objects.get(username="new@example.com")
        income = MonthlyIncome.objects.get(user=user)
        self.assertEqual(income.amount, DEFAULT_SALARY)

    def test_existing_user_login_does_not_add_more_transactions_or_income(self):
        user = User.objects.create_user(username="existing@example.com", email="existing@example.com")
        Transaction.objects.create(
            user=user, amount="10.00", currency="NGN", date="2024-01-01", category="Other"
        )
        self.client.post("/api/auth/request-otp/", {"email": "existing@example.com"})
        code = self._code_from_outbox()

        self.client.post("/api/auth/verify-otp/", {"email": "existing@example.com", "code": code})

        self.assertEqual(Transaction.objects.filter(user=user).count(), 1)
        self.assertEqual(MonthlyIncome.objects.filter(user=user).count(), 0)

    def test_wrong_code_is_rejected(self):
        self.client.post("/api/auth/request-otp/", {"email": "user@example.com"})
        response = self.client.post(
            "/api/auth/verify-otp/", {"email": "user@example.com", "code": "000000"}
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_malformed_code(self):
        response = self.client.post(
            "/api/auth/verify-otp/", {"email": "user@example.com", "code": "abc"}
        )
        self.assertEqual(response.status_code, 400)

    def test_no_code_requested_yet_is_rejected(self):
        response = self.client.post(
            "/api/auth/verify-otp/", {"email": "never-requested@example.com", "code": "123456"}
        )
        self.assertEqual(response.status_code, 400)


class LoginPageTests(TestCase):
    def test_renders_for_anonymous_visitor(self):
        response = self.client.get("/login/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Send code")

    def test_redirects_to_dashboard_if_already_authenticated(self):
        user = User.objects.create_user(username="user@example.com")
        self.client.force_login(user)
        response = self.client.get("/login/")
        self.assertRedirects(response, "/dashboard/")


class LogoutViewTests(TestCase):
    def test_logout_ends_session_and_redirects_to_login(self):
        user = User.objects.create_user(username="user@example.com")
        self.client.force_login(user)

        response = self.client.get("/logout/")
        self.assertRedirects(response, "/login/")

        # session is gone — protected page now redirects to login
        dashboard_response = self.client.get("/dashboard/")
        self.assertEqual(dashboard_response.status_code, 302)
