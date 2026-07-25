// Mirrors receipts/ocr/categorize.py CATEGORIES and receipts/ocr/parser.py
// CURRENCIES — both are fixed, rarely-changing enums on the backend
// (also enforced there as model/serializer choices), so hardcoding them
// here avoids an extra round-trip. Keep in sync if either list changes.
export const CATEGORIES = ['Groceries', 'Transport', 'Dining', 'Utilities', 'Entertainment', 'Other'];
export const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'];
