from rest_framework import serializers

from .ocr.categorize import CATEGORIES
from .ocr.parser import CURRENCIES


class ReceiptUploadSerializer(serializers.Serializer):
    """Validates the incoming upload(s) only; the images themselves are
    never saved to a model, so this is a plain (non-ModelSerializer)
    serializer. Accepts one or many images in a single request."""

    images = serializers.ListField(
        child=serializers.ImageField(), allow_empty=False, max_length=20
    )


class LineItemSerializer(serializers.Serializer):
    description = serializers.CharField()
    price = serializers.FloatField()


class ExtractedFieldsSerializer(serializers.Serializer):
    date = serializers.DateField(allow_null=True)
    amount = serializers.FloatField(allow_null=True)
    currency = serializers.ChoiceField(choices=CURRENCIES)
    category = serializers.ChoiceField(choices=CATEGORIES)
    line_items = LineItemSerializer(many=True)
    raw_ocr_text = serializers.CharField(allow_blank=True)
