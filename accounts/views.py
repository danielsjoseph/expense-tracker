import socket
import time
from smtplib import SMTPConnectError, SMTPException, SMTPServerDisconnected

from anymail.exceptions import AnymailError
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.core.mail import send_mail
from django.middleware.csrf import get_token
from django.shortcuts import redirect
from django.utils import timezone
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
# Only applies to the raw-SMTP path (local dev); the SendGrid/Anymail path
# used in production raises AnymailError instead, which is always treated
# as non-retryable below.
RETRYABLE_EMAIL_ERRORS = (
    socket.gaierror,
    ConnectionError,
    TimeoutError,
    SMTPConnectError,
    SMTPServerDisconnected,
)
MAX_SEND_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1.5

# Prevents both abuse (repeatedly emailing an address that isn't yours) and
# accidentally burning through a low daily sending quota (e.g. Resend's free
# tier) via a runaway "resend" button.
OTP_RESEND_COOLDOWN_SECONDS = 60


class RequestOtpView(APIView):
    """Generates a login code and emails it — synchronously, in this same
    request/response cycle, via Gmail SMTP. No task queue involved. Retries
    a bounded number of times on transient connectivity errors only."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()

        last_otp = LoginOTP.objects.filter(email__iexact=email).order_by("-created_at").first()
        if last_otp:
            elapsed = (timezone.now() - last_otp.created_at).total_seconds()
            if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                wait_seconds = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed) + 1
                return Response(
                    {"detail": f"Please wait {wait_seconds}s before requesting another code."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

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
            except (SMTPException, OSError, AnymailError) as exc:
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
        # Every mutating call from here on is against an authenticated
        # session, which DRF's SessionAuthentication *does* CSRF-check —
        # unlike this endpoint itself. Force the cookie to exist now rather
        # than relying on the SPA shell's own ensure_csrf_cookie having run
        # first (it won't have, e.g. under the Vite dev server).
        get_token(request)
        return Response({"detail": "Logged in."})


class MeView(APIView):
    """Tells the SPA whether the current session is authenticated, and as
    whom — the client-side router uses this to decide whether to render
    protected pages or bounce to /login. Default IsAuthenticated permission
    means an anonymous request gets a plain 403 here, which the frontend
    treats the same as "not logged in"."""

    def get(self, request):
        return Response({"email": request.user.email or request.user.username})


def logout_view(request):
    django_logout(request)
    return redirect("/login/")
