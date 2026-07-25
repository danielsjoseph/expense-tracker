import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone

OTP_TTL_MINUTES = 10
MAX_ATTEMPTS = 5


class LoginOTP(models.Model):
    """A one-time login code for a given email. The code itself is never
    stored in plain text — only its hash, via Django's password hashers."""

    email = models.EmailField()
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"OTP for {self.email} ({'used' if self.used else 'active'})"

    @classmethod
    def issue(cls, email):
        """Invalidate any still-active codes for this email, then create and
        return (otp, plaintext_code) — the plaintext code exists only in
        memory here, long enough to be emailed."""
        cls.objects.filter(email__iexact=email, used=False).update(used=True)
        code = f"{secrets.randbelow(1_000_000):06d}"
        otp = cls.objects.create(
            email=email,
            code_hash=make_password(code),
            expires_at=timezone.now() + timedelta(minutes=OTP_TTL_MINUTES),
        )
        return otp, code

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def verify(self, code):
        """Check a submitted code, consuming an attempt regardless of the
        outcome so a fixed number of guesses is enforced per issued code."""
        if self.used or self.is_expired or self.attempts >= MAX_ATTEMPTS:
            return False
        self.attempts += 1
        self.save(update_fields=["attempts"])
        if check_password(code, self.code_hash):
            self.used = True
            self.save(update_fields=["used"])
            return True
        return False
