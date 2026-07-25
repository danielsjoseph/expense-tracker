"""Keyword-based best-effort category guess from a merchant name. Pure Python.

CATEGORIES is the single source of truth for the fixed category list used
throughout the app (model choices, dropdown options, API validation).
"""

CATEGORY_KEYWORDS = {
    "Groceries": ["shoprite", "walmart", "kroger", "supermarket", "grocery", "market"],
    "Transport": ["uber", "bolt", "lyft", "taxi", "gas station", "shell", "chevron"],
    "Dining": ["restaurant", "cafe", "coffee", "kfc", "mcdonald", "pizza", "starbucks"],
    "Utilities": ["electric", "water corp", "power", "internet", "telecom"],
    "Entertainment": ["cinema", "netflix", "spotify", "theatre"],
}

CATEGORIES = list(CATEGORY_KEYWORDS.keys()) + ["Other"]


def guess_category(merchant):
    if merchant:
        lowered = merchant.lower()
        for category, keywords in CATEGORY_KEYWORDS.items():
            if any(keyword in lowered for keyword in keywords):
                return category
    return "Other"
