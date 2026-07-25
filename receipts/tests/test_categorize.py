from django.test import SimpleTestCase

from receipts.ocr.categorize import guess_category


class GuessCategoryTests(SimpleTestCase):
    def test_matches_known_keyword(self):
        self.assertEqual(guess_category("UBER TRIP 12345"), "Transport")
        self.assertEqual(guess_category("Shoprite Supermarket"), "Groceries")

    def test_unknown_merchant_falls_back_to_other(self):
        self.assertEqual(guess_category("Some Random Store"), "Other")

    def test_blank_merchant_falls_back_to_other(self):
        self.assertEqual(guess_category(""), "Other")
