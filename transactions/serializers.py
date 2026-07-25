from rest_framework import serializers

from .models import ExtraIncome, MonthlyIncome, Transaction


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id",
            "amount",
            "currency",
            "date",
            "category",
            "raw_ocr_text",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class MonthlyIncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthlyIncome
        fields = ["id", "month", "amount", "currency", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class IncomeInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    currency = serializers.CharField(max_length=10, default="NGN")


class ExtraIncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtraIncome
        fields = ["id", "month", "amount", "currency", "description", "created_at"]
        read_only_fields = ["id", "month", "created_at"]
