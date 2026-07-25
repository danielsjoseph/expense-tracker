"""Structured-field extraction from raw OCR text.

Deliberately plain Python with no Django imports so it can be unit tested
in isolation from the web framework, the OCR engine, or a database.
"""
import re

from dateutil import parser as date_parser

CURRENCIES = ["NGN", "USD", "EUR", "GBP"]

CURRENCY_SYMBOLS = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "₦": "NGN",
}

TOTAL_KEYWORDS_PRIORITY = [
    "grand total",
    "total due",
    "amount due",
    "balance due",
    "total",
    "amount",
]

EXCLUDE_TOTAL_LINE_KEYWORDS = ["subtotal", "sub total", "sub-total"]

AMOUNT_RE = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?")

DATE_RE = re.compile(
    r"\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}"
    r"|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4}"
    r"|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4}"
)

LINE_ITEM_RE = re.compile(r"^(.{3,40}?)\s{2,}(\d[\d.,]*)$")


def parse_receipt_text(raw_text):
    """Extract merchant/date/amount/currency/line_items from raw OCR text."""
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    return {
        "merchant": _extract_merchant(lines),
        "date": _extract_date(lines),
        "amount": _extract_total_amount(lines),
        "currency": _extract_currency(raw_text),
        "line_items": _extract_line_items(lines),
    }


def _extract_merchant(lines):
    for line in lines[:5]:
        if _looks_like_date_or_amount(line):
            continue
        letters = sum(char.isalpha() for char in line)
        if letters >= 3:
            return line
    return lines[0] if lines else ""


def _looks_like_date_or_amount(line):
    if DATE_RE.fullmatch(line.strip()):
        return True
    digits = sum(char.isdigit() for char in line)
    return digits > 0 and digits >= len(line.strip()) * 0.6


def _extract_date(lines):
    for line in lines:
        match = DATE_RE.search(line)
        if not match:
            continue
        try:
            parsed = date_parser.parse(match.group(0), fuzzy=True, dayfirst=False)
            return parsed.date().isoformat()
        except (ValueError, OverflowError):
            continue
    return None


def _extract_total_amount(lines):
    lowered = [(line, line.lower()) for line in lines]

    for keyword in TOTAL_KEYWORDS_PRIORITY:
        for index, (line, lower) in enumerate(lowered):
            keyword_pos = lower.find(keyword)
            if keyword_pos == -1:
                continue
            if any(excluded in lower for excluded in EXCLUDE_TOTAL_LINE_KEYWORDS):
                continue
            # Only look for the amount after the keyword, so a number inside
            # the label itself (e.g. a "18% VAT" note) is never mistaken for it.
            amount = _first_amount_on_line(line[keyword_pos + len(keyword):])
            if amount is None and index + 1 < len(lowered):
                # Some layouts (and OCR line-splitting) put the label and its
                # value on separate lines, e.g. "Transaction Amount" / "N200.00".
                next_line, next_lower = lowered[index + 1]
                if not any(ex in next_lower for ex in EXCLUDE_TOTAL_LINE_KEYWORDS):
                    amount = _first_amount_on_line(next_line)
            if amount is not None:
                return amount

    # Fallback: no total-labeled line found anywhere, so guess from every
    # number on the page. Restricted to numbers formatted like money (with a
    # decimal fraction) so long bare-integer IDs — phone numbers, account
    # numbers, reference codes — are never mistaken for the amount.
    moneyish_amounts = []
    all_amounts = []
    for line, lower in lowered:
        if any(excluded in lower for excluded in EXCLUDE_TOTAL_LINE_KEYWORDS):
            continue
        if DATE_RE.fullmatch(line.strip()):
            continue
        for match in AMOUNT_RE.finditer(line):
            value = _to_decimal(match.group(0))
            if value is None:
                continue
            all_amounts.append(value)
            if _looks_like_money(match.group(0)):
                moneyish_amounts.append(value)

    if moneyish_amounts:
        return max(moneyish_amounts)
    return max(all_amounts) if all_amounts else None


def _all_amounts_on_line(line):
    amounts = []
    for match in AMOUNT_RE.finditer(line):
        value = _to_decimal(match.group(0))
        if value is not None:
            amounts.append(value)
    return amounts


def _first_amount_on_line(line):
    amounts = _all_amounts_on_line(line)
    return amounts[0] if amounts else None


def _looks_like_money(raw):
    """True for a genuine decimal fraction (e.g. '200.00' or '12,50'), as
    opposed to a bare integer like a phone number or account ID."""
    cleaned = raw.replace(" ", "")
    if "." in cleaned:
        return True
    return cleaned.count(",") == 1 and len(cleaned.split(",")[-1]) == 2


def _to_decimal(raw):
    cleaned = raw.replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    elif cleaned.count(",") == 1 and len(cleaned.split(",")[-1]) == 2:
        cleaned = cleaned.replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def _extract_currency(raw_text):
    for symbol, code in CURRENCY_SYMBOLS.items():
        if symbol in raw_text:
            return code
    for code in CURRENCIES:
        if re.search(rf"\b{code}\b", raw_text):
            return code
    return "NGN"


def _extract_line_items(lines):
    items = []
    for line in lines:
        match = LINE_ITEM_RE.match(line)
        if not match:
            continue
        description = match.group(1).strip()
        price = _to_decimal(match.group(2))
        if price is not None:
            items.append({"description": description, "price": price})
    return items
