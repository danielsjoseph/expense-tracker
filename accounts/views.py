import socket
import time
from smtplib import SMTPConnectError, SMTPException, SMTPServerDisconnected

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.core.mail import send_mail
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from transactions.demo_seed import seed_demo_transactions

from .models import OTP_TTL_MINUTES, LoginOTP
from .serializers import RequestOtpSerializer, VerifyOtpSerializer

User = get_user_model()

# Transient, worth a retry: DNS hiccups, dropped/refused connections, timeouts.
# Deliberately excludes things like SMTPAuthenticationError or
# SMTPRecipientsRefused — those are permanent failures (bad credentials, bad
# address) that a retry can't fix, so they're left to the broader handler
# below and reported immediately instead of wasting the user's time.
RETRYABLE_EMAIL_ERRORS = (
    socket.gaierror,
    ConnectionError,
    TimeoutError,
    SMTPConnectError,
    SMTPServerDisconnected,
)
MAX_SEND_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1.5


class RequestOtpView(APIView):
    """Generates a login code and emails it — synchronously, in this same
    request/response cycle, via Gmail SMTP. No task queue involved. Retries
    a bounded number of times on transient connectivity errors only."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()

        _otp, code = LoginOTP.issue(email)
        message = (
            f"Your login code is {code}.\n\n"
            f"It expires in {OTP_TTL_MINUTES} minutes. If you didn't "
            "request this, you can ignore this email."
        )

        last_error = None
        for attempt in range(1, MAX_SEND_ATTEMPTS + 1):
            try:
                send_mail(
                    subject="Your Expense Tracker login code",
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    fail_silently=False,
                )
                return Response({"detail": "Code sent."})
            except RETRYABLE_EMAIL_ERRORS as exc:
                last_error = exc
                if attempt < MAX_SEND_ATTEMPTS:
                    time.sleep(RETRY_DELAY_SECONDS)
            except (SMTPException, OSError) as exc:
                return Response(
                    {"detail": f"Could not send the code: {exc}"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

        return Response(
            {
                "detail": (
                    f"Could not send the code after {MAX_SEND_ATTEMPTS} attempts: "
                    f"{last_error}"
                )
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class VerifyOtpView(APIView):
    """Verifies a code and logs the user in, auto-creating a User for the
    email on first successful verification (passwordless account creation)."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()
        code = serializer.validated_data["code"]

        otp = (
            LoginOTP.objects.filter(email__iexact=email, used=False)
            .order_by("-created_at")
            .first()
        )
        if not otp or not otp.verify(code):
            return Response(
                {"detail": "Invalid or expired code."}, status=status.HTTP_400_BAD_REQUEST
            )

        user, created = User.objects.get_or_create(username=email, defaults={"email": email})
        if created:
            seed_demo_transactions(user)
        django_login(request, user)
        return Response({"detail": "Logged in."})


@ensure_csrf_cookie
def login_page(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    return render(request, "accounts/login.html")


def logout_view(request):
    django_logout(request)
    return redirect("login")
