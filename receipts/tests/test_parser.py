from django.test import SimpleTestCase

from receipts.ocr.parser import parse_receipt_text


class ParseReceiptTextTests(SimpleTestCase):
    def test_extracts_merchant_date_amount_and_currency(self):
        text = (
            "STARBUCKS\n"
            "05/01/2024\n"
            "Latte 4.50\n"
            "Subtotal: 4.50\n"
            "Tax: 0.36\n"
            "Total: $4.86"
        )
        result = parse_receipt_text(text)

        self.assertEqual(result["merchant"], "STARBUCKS")
        self.assertEqual(result["date"], "2024-05-01")
        self.assertEqual(result["amount"], 4.86)
        self.assertEqual(result["currency"], "USD")

    def test_total_is_distinguished_from_subtotal_and_tax(self):
        text = "SHOP\n01/01/2024\nSubtotal 9.80\nTax 0.70\nTotal 10.50"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 10.50)

    def test_handles_thousands_separator_amount(self):
        text = "Uber Receipt\n2024-06-10\nTrip fare\nTotal: 12,345.67"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 12345.67)

    def test_falls_back_to_largest_amount_when_no_total_keyword(self):
        text = "SOME SHOP\n01/01/2024\nItem 5.00\nItem 3.00"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 5.00)

    def test_amount_keyword_used_when_no_total_line_present(self):
        text = "SHOP\n01/01/2024\nAmount: 45.99"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 45.99)

    def test_total_keyword_takes_priority_over_amount_keyword(self):
        text = "SHOP\n01/01/2024\nAmount Tendered: 50.00\nChange: 5.00\nTotal: 45.00"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 45.00)

    def test_returns_none_amount_when_no_numbers_present(self):
        text = "SOME SHOP\nno numbers here at all"
        result = parse_receipt_text(text)
        self.assertIsNone(result["amount"])

    def test_currency_defaults_to_ngn_when_undetected(self):
        text = "LOCAL SHOP\n01/01/2024\nTotal 500"
        result = parse_receipt_text(text)
        self.assertEqual(result["currency"], "NGN")

    def test_extracts_line_items(self):
        text = "SHOP\n01/01/2024\nBread  2.50\nMilk  3.20\nTotal  5.70"
        result = parse_receipt_text(text)
        descriptions = [item["description"] for item in result["line_items"]]
        self.assertIn("Bread", descriptions)
        self.assertIn("Milk", descriptions)

    def test_amount_regex_does_not_split_bare_digit_run(self):
        # OCR sometimes drops the decimal point entirely (e.g. "10.50" -> "1050")
        text = "SHOP\n01/01/2024\nTotal 1050"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 1050.0)

    def test_keyword_value_on_next_line_is_found(self):
        text = "SHOP\n01/01/2024\nAmount\n45.99"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 45.99)

    def test_fallback_ignores_bare_integer_ids_like_phone_numbers(self):
        # Regression: a bank transaction receipt full of long ID numbers
        # (phone/account/reference) must not have one of those picked over
        # the actual amount just because it's numerically larger.
        text = (
            "Transaction Details\n"
            "Transaction Amount\n"
            "N200.00\n"
            "Beneficiary Details        MTN NG DATA 09033899569\n"
            "Sender Details        DANIELS, ONWUALU JOSEPH\n"
            "Kuda | 2007687606\n"
            "Fees        N0\n"
            "VAT        N0\n"
        )
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 200.0)

    def test_fallback_falls_back_further_to_bare_integers_if_nothing_moneyish(self):
        # No decimal-formatted numbers at all: still return the largest bare
        # integer rather than giving up, since that's the best guess available.
        text = "SHOP\nno keyword line here\nqty 5\nqty 12"
        result = parse_receipt_text(text)
        self.assertEqual(result["amount"], 12.0)
