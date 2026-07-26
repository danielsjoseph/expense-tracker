// Keyword-based best-effort category guess from a merchant name — ported
// from receipts/ocr/categorize.py. CATEGORIES itself lives in
// ../constants.js (shared with the rest of the app); this only needs the
// keyword lists.
const CATEGORY_KEYWORDS = {
  Groceries: ['shoprite', 'walmart', 'kroger', 'supermarket', 'grocery', 'market'],
  Transport: ['uber', 'bolt', 'lyft', 'taxi', 'gas station', 'shell', 'chevron'],
  Dining: ['restaurant', 'cafe', 'coffee', 'kfc', 'mcdonald', 'pizza', 'starbucks'],
  Utilities: ['electric', 'water corp', 'power', 'internet', 'telecom'],
  Entertainment: ['cinema', 'netflix', 'spotify', 'theatre'],
};

export function guessCategory(merchant) {
  if (merchant) {
    const lowered = merchant.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((keyword) => lowered.includes(keyword))) {
        return category;
      }
    }
  }
  return 'Other';
}
