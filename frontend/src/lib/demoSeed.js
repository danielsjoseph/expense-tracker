// Gives a brand-new browser some sample data so the dashboard isn't empty
// on first visit: 20 random transactions spread over the last 60 days,
// plus a default salary. Ported from the old Django app's per-account
// demo seeding — now runs once per browser (checked in App.jsx) instead of
// once per new account, since there are no accounts anymore.
import { createTransaction, listTransactions, setMonthlyIncome } from './db';
import { todayIso } from './date';

// Rough per-category ranges (NGN) so seeded data looks plausible rather
// than uniformly random — e.g. Transport fares shouldn't land in
// Utilities' range.
const CATEGORY_AMOUNT_RANGES = {
  Groceries: [2000, 25000],
  Transport: [500, 8000],
  Dining: [1500, 15000],
  Utilities: [3000, 30000],
  Entertainment: [1000, 12000],
  Other: [500, 20000],
};

const DEMO_TRANSACTION_COUNT = 20;
export const DEFAULT_SALARY = 500_000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export async function seedDemoDataIfEmpty() {
  const existing = await listTransactions();
  if (existing.length > 0) return;

  const categories = Object.keys(CATEGORY_AMOUNT_RANGES);
  const creations = Array.from({ length: DEMO_TRANSACTION_COUNT }, () => {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const [min, max] = CATEGORY_AMOUNT_RANGES[category];
    return createTransaction({
      date: isoDateDaysAgo(randomInt(0, 59)),
      amount: randomInt(min, max),
      currency: 'NGN',
      category,
    });
  });

  await Promise.all(creations);
  await setMonthlyIncome(todayIso(), DEFAULT_SALARY, 'NGN');
}
