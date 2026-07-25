from django.contrib import admin

from .models import ExtraIncome, MonthlyIncome, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("amount", "currency", "date", "category", "user", "created_at")
    list_filter = ("category", "currency", "date")
    search_fields = ("raw_ocr_text",)
    date_hierarchy = "date"
    ordering = ("-date",)


@admin.register(MonthlyIncome)
class MonthlyIncomeAdmin(admin.ModelAdmin):
    list_display = ("month", "amount", "currency", "user", "updated_at")
    list_filter = ("currency",)
    ordering = ("-month",)


@admin.register(ExtraIncome)
class ExtraIncomeAdmin(admin.ModelAdmin):
    list_display = ("month", "amount", "currency", "description", "user", "created_at")
    list_filter = ("currency",)
    search_fields = ("description",)
    ordering = ("-created_at",)
