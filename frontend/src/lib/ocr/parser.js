// Structured-field extraction from raw OCR text — ported from
// receipts/ocr/parser.py (the Django backend's original server-side
// implementation) so the client-side pipeline behaves identically,
// including the phone-number-vs-amount fix (_looksLikeMoney below).
import { CURRENCIES } from '../constants';
import { parseDateFragment } from './dateParser';

const CURRENCY_SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', '₦': 'NGN' };

const TOTAL_KEYWORDS_PRIORITY = [
  'grand total', 'total due', 'amount due', 'balance due', 'total', 'amount',
  // Bank transfer/payment confirmations ("You have successfully transferred
  // NGN50,000 to ...") often have no "total"/"amount" label at all, which
  // used to send extraction straight to the ambiguous whole-page fallback
  // below — where a longer account/reference number could outweigh the
  // real amount. Catching this phrasing here finds the right number first.
  'transferred',
];
const EXCLUDE_TOTAL_LINE_KEYWORDS = ['subtotal', 'sub total', 'sub-total'];

const AMOUNT_SOURCE = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const DATE_SOURCE = String.raw`\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4}`;
const LINE_ITEM_RE = /^(.{3,40}?)\s{2,}(\d[\d.,]*)$/;

const AMOUNT_RE_G = new RegExp(AMOUNT_SOURCE, 'g');
const DATE_RE = new RegExp(DATE_SOURCE);
const DATE_FULLMATCH_RE = new RegExp(`^(?:${DATE_SOURCE})$`);

export function parseReceiptText(rawText) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    merchant: extractMerchant(lines),
    date: extractDate(lines),
    amount: extractTotalAmount(lines),
    currency: extractCurrency(rawText),
    line_items: extractLineItems(lines),
  };
}

function looksLikeDateOrAmount(line) {
  if (DATE_FULLMATCH_RE.test(line.trim())) return true;
  const digits = (line.match(/\d/g) || []).length;
  return digits > 0 && digits >= line.trim().length * 0.6;
}

function extractMerchant(lines) {
  for (const line of lines.slice(0, 5)) {
    if (looksLikeDateOrAmount(line)) continue;
    const letters = (line.match(/[a-zA-Z]/g) || []).length;
    if (letters >= 3) return line;
  }
  return lines[0] || '';
}

function extractDate(lines) {
  for (const line of lines) {
    const match = line.match(DATE_RE);
    if (!match) continue;
    const parsed = parseDateFragment(match[0]);
    if (parsed) return parsed;
  }
  return null;
}

function allAmountsOnLine(line) {
  const amounts = [];
  for (const match of line.matchAll(AMOUNT_RE_G)) {
    const value = toDecimal(match[0]);
    if (value !== null) amounts.push(value);
  }
  return amounts;
}

function firstAmountOnLine(line) {
  const amounts = allAmountsOnLine(line);
  return amounts.length ? amounts[0] : null;
}

function extractTotalAmount(lines) {
  const lowered = lines.map((line) => [line, line.toLowerCase()]);

  for (const keyword of TOTAL_KEYWORDS_PRIORITY) {
    for (let index = 0; index < lowered.length; index += 1) {
      const [line, lower] = lowered[index];
      const keywordPos = lower.indexOf(keyword);
      if (keywordPos === -1) continue;
      if (EXCLUDE_TOTAL_LINE_KEYWORDS.some((excluded) => lower.includes(excluded))) continue;

      // Only look for the amount after the keyword, so a number inside the
      // label itself (e.g. an "18% VAT" note) is never mistaken for it.
      let amount = firstAmountOnLine(line.slice(keywordPos + keyword.length));
      if (amount === null && index + 1 < lowered.length) {
        // Some layouts (and OCR line-splitting) put the label and its value
        // on separate lines, e.g. "Transaction Amount" / "N200.00".
        const [nextLine, nextLower] = lowered[index + 1];
        if (!EXCLUDE_TOTAL_LINE_KEYWORDS.some((ex) => nextLower.includes(ex))) {
          amount = firstAmountOnLine(nextLine);
        }
      }
      if (amount !== null) return amount;
    }
  }

  // Fallback: no total-labeled line found anywhere, so guess from every
  // number on the page. Restricted to numbers formatted like money (with a
  // decimal fraction) so long bare-integer IDs — phone numbers, account
  // numbers, reference codes — are never mistaken for the amount.
  const moneyishAmounts = [];
  const allAmounts = [];
  for (const [line, lower] of lowered) {
    if (EXCLUDE_TOTAL_LINE_KEYWORDS.some((excluded) => lower.includes(excluded))) continue;
    if (DATE_FULLMATCH_RE.test(line.trim())) continue;
    for (const match of line.matchAll(AMOUNT_RE_G)) {
      const value = toDecimal(match[0]);
      if (value === null) continue;
      allAmounts.push(value);
      if (looksLikeMoney(match[0])) moneyishAmounts.push(value);
    }
  }

  if (moneyishAmounts.length) return Math.max(...moneyishAmounts);
  return allAmounts.length ? Math.max(...allAmounts) : null;
}

function looksLikeMoney(raw) {
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.includes('.')) return true;
  // Thousands-grouped, e.g. "50,000" — nobody formats a phone/account/
  // reference number with comma grouping, so this is a reliable money
  // signal even without a decimal fraction.
  if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) return true;
  const parts = cleaned.split(',');
  return parts.length === 2 && parts[1].length === 2;
}

function toDecimal(raw) {
  let cleaned = raw.replace(/\s/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/,/g, '');
  } else {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? null : Math.round(value * 100) / 100;
}

function extractCurrency(rawText) {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (rawText.includes(symbol)) return code;
  }
  for (const code of CURRENCIES) {
    if (new RegExp(`\\b${code}\\b`).test(rawText)) return code;
  }
  return 'NGN';
}

function extractLineItems(lines) {
  const items = [];
  for (const line of lines) {
    const match = line.match(LINE_ITEM_RE);
    if (!match) continue;
    const price = toDecimal(match[2]);
    if (price !== null) {
      items.push({ description: match[1].trim(), price });
    }
  }
  return items;
}
