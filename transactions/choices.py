"""Fixed choice lists for Transaction/MonthlyIncome/ExtraIncome fields.

Single source of truth on the backend (model choices, API validation).
Mirrored on the frontend in frontend/src/lib/constants.js — keep both in
sync if either list changes.
"""

CATEGORIES = ["Groceries", "Transport", "Dining", "Utilities", "Entertainment", "Other"]
CURRENCIES = ["NGN", "USD", "EUR", "GBP"]
