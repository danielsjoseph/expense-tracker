from django.contrib import admin

from .models import LoginOTP


@admin.register(LoginOTP)
class LoginOTPAdmin(admin.ModelAdmin):
    # Deliberately no code/code_hash in list_display or search_fields —
    # the hash is useless without the plaintext anyway, but there's no
    # reason to surface it at all.
    list_display = ("email", "created_at", "expires_at", "attempts", "used")
    list_filter = ("used",)
    search_fields = ("email",)
    ordering = ("-created_at",)
