import { filterTransactions } from './aggregations';

function formatComma(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Builds the transactions CSV (comma-formatted amounts, a trailing Total
 * Expense row) and triggers a browser download — entirely client-side,
 * since there's no server to generate it anymore. */
export function exportTransactionsToCsv(transactions, filters = {}) {
  const filtered = [...filterTransactions(transactions, filters)].sort((a, b) => (a.date < b.date ? 1 : -1));

  const rows = [['Date', 'Amount', 'Currency', 'Category']];
  let total = 0;
  for (const t of filtered) {
    rows.push([t.date, formatComma(t.amount), t.currency, t.category]);
    total += Number(t.amount);
  }
  rows.push([]);
  rows.push(['Total Expense', formatComma(total), '', '']);

  const csvContent = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'transactions.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
