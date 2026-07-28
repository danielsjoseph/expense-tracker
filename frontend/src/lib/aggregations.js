// Dashboard/category math — ported from the old Django dashboard app's
// aggregation helpers (dashboard/views.py in earlier history) to run over
// plain in-memory arrays instead of a database queryset, since all data
// now lives in the browser via IndexedDB (see db.js).
import { CATEGORIES } from './constants';
import { monthStartIso, todayIso } from './date';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function filterTransactions(transactions, { category, date_from: dateFrom, date_to: dateTo } = {}) {
  return transactions.filter((t) => {
    if (category && (t.category || '').toLowerCase() !== category.toLowerCase()) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });
}

export function sumAmounts(transactions) {
  return round2(transactions.reduce((sum, t) => sum + Number(t.amount), 0));
}

// Every calendar day from the 1st of the current month through today,
// inclusive — built from local Y/M/D integers (not UTC) so a day never
// shifts by the browser's timezone offset.
function daysFromMonthStartToToday() {
  const today = todayIso();
  const monthStart = monthStartIso(today);
  const [ey, em, ed] = today.split('-').map(Number);
  let [y, m, d] = monthStart.split('-').map(Number);

  const dates = [];
  for (;;) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (y === ey && m === em && d === ed) break;
    const next = new Date(y, m - 1, d + 1);
    y = next.getFullYear();
    m = next.getMonth() + 1;
    d = next.getDate();
  }
  return dates;
}

export function dailySpendThisMonth(transactions) {
  const totalsByDay = {};
  for (const t of transactions) {
    totalsByDay[t.date] = (totalsByDay[t.date] || 0) + Number(t.amount);
  }

  const days = daysFromMonthStartToToday();
  const labels = days.map((iso) => {
    const [, m, d] = iso.split('-');
    return `${MONTH_ABBR[Number(m) - 1]} ${d}`;
  });
  const totals = days.map((iso) => round2(totalsByDay[iso] || 0));
  return { labels, totals };
}

// Spend by category, respecting the date range filter but deliberately NOT
// the category filter itself — otherwise viewing one category's detail
// page would collapse this chart to a single 100% slice, destroying the
// context the chart is there to show.
export function categoryBreakdown(transactions, { date_from: dateFrom, date_to: dateTo } = {}) {
  const filtered = transactions.filter((t) => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  const totals = {};
  for (const t of filtered) {
    const cat = t.category || 'Uncategorized';
    totals[cat] = (totals[cat] || 0) + Number(t.amount);
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return {
    labels: entries.map(([label]) => label),
    totals: entries.map(([, total]) => round2(total)),
  };
}

export function incomeVsSpentBreakdown(income, spent) {
  income = Number(income);
  spent = Number(spent);

  if (income <= 0) {
    return spent > 0 ? { labels: ['Spent'], totals: [round2(spent)] } : { labels: [], totals: [] };
  }

  const spentWithinIncome = Math.min(spent, income);
  const remaining = Math.max(income - spent, 0);
  const overspent = Math.max(spent - income, 0);

  const labels = ['Spent', 'Remaining'];
  const totals = [round2(spentWithinIncome), round2(remaining)];
  if (overspent > 0) {
    labels.push('Over budget');
    totals.push(round2(overspent));
  }
  return { labels, totals };
}

/** Everything the dashboard page needs, in the same shape the old
 * /api/dashboard/summary/ endpoint returned. */
export function buildDashboardSummary(transactions, { baseIncome, extraIncome, filters = {} }) {
  const filtered = filterTransactions(transactions, filters);
  const total = sumAmounts(filtered);

  const monthStart = monthStartIso();
  const monthSpent = sumAmounts(transactions.filter((t) => t.date >= monthStart));

  const totalIncome = round2(Number(baseIncome) + Number(extraIncome));
  const { labels: dayLabels, totals: dayTotals } = dailySpendThisMonth(transactions);
  const { labels: pieLabels, totals: pieTotals } = incomeVsSpentBreakdown(totalIncome, monthSpent);
  const { labels: catLabels, totals: catTotals } = categoryBreakdown(transactions, filters);

  return {
    total,
    day_labels: dayLabels,
    day_totals: dayTotals,
    income_pie_labels: pieLabels,
    income_pie_totals: pieTotals,
    category_chart_labels: catLabels,
    category_chart_totals: catTotals,
    categories: CATEGORIES,
    monthly_income: totalIncome,
    base_income: round2(baseIncome),
    extra_income: round2(extraIncome),
    month_spent: monthSpent,
    month_remaining: round2(totalIncome - monthSpent),
  };
}

/** Same category chart data as the dashboard, plus this one category's own
 * total — for the category detail page. */
export function buildCategorySummary(transactions, category, filters = {}) {
  const filtered = filterTransactions(transactions, { ...filters, category });
  const total = sumAmounts(filtered);
  const { labels, totals } = categoryBreakdown(transactions, filters);
  return { category, total, category_chart_labels: labels, category_chart_totals: totals };
}
