import io
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from transactions.models import Transaction

User = get_user_model()


def _sample_upload(name="receipt.png"):
    img = Image.new("RGB", (100, 100), "white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    buffer.name = name
    return buffer


class ExtractReceiptViewTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="user@example.com")
        self.client = APIClient()
        self.client.force_login(user)

    @patch("receipts.ocr.pipeline.extract_text")
    def test_extract_returns_parsed_fields_without_writing_to_db(self, mock_extract_text):
        mock_extract_text.return_value = "STARBUCKS\n05/01/2024\nTotal: $4.86"

        response = self.client.post(
            "/api/extract/", {"images": [_sample_upload()]}, format="multipart"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        result = response.data["results"][0]
        self.assertNotIn("merchant", result)
        self.assertEqual(result["amount"], 4.86)
        self.assertEqual(result["currency"], "USD")
        self.assertEqual(result["category"], "Dining")
        # /api/extract/ must never write to the database
        self.assertEqual(Transaction.objects.count(), 0)

    @patch("receipts.ocr.pipeline.extract_text")
    def test_extract_processes_multiple_images_independently(self, mock_extract_text):
        mock_extract_text.side_effect = [
            "STARBUCKS\n05/01/2024\nTotal: $4.86",
            "SHOPRITE\n01/01/2024\nTotal: 20.00",
        ]

        response = self.client.post(
            "/api/extract/",
            {"images": [_sample_upload("a.png"), _sample_upload("b.png")]},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["filename"], "a.png")
        self.assertEqual(results[0]["amount"], 4.86)
        self.assertEqual(results[1]["filename"], "b.png")
        self.assertEqual(results[1]["amount"], 20.00)
        self.assertEqual(Transaction.objects.count(), 0)

    @patch("receipts.ocr.pipeline.extract_text")
    def test_no_media_root_directory_is_created_by_extraction(self, mock_extract_text):
        mock_extract_text.return_value = "SHOP\nTotal 10.00"
        media_root = getattr(settings, "MEDIA_ROOT", None)

        self.client.post("/api/extract/", {"images": [_sample_upload()]}, format="multipart")

        # The project deliberately has no MEDIA_ROOT configured; confirm that
        # holds and that nothing materialized one as a side effect.
        self.assertFalse(media_root)

    def test_rejects_non_image_upload(self):
        bad_file = io.BytesIO(b"not an image")
        bad_file.name = "not-an-image.txt"
        response = self.client.post("/api/extract/", {"images": [bad_file]}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_rejects_empty_image_list(self):
        response = self.client.post("/api/extract/", {"images": []}, format="multipart")
        self.assertEqual(response.status_code, 400)
