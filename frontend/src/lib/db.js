// All app data (transactions, monthly salary, extra income) lives in the
// browser via IndexedDB — there is no backend database at all. This is a
// deliberate architecture choice, not a stopgap: nothing here ever leaves
// the device, and nothing here ever calls the Django server.
const DB_NAME = 'expense-tracker-data';
const DB_VERSION = 1;
const STORES = {
  TRANSACTIONS: 'transactions',
  MONTHLY_INCOME: 'monthlyIncome',
  EXTRA_INCOME: 'extraIncome',
};

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
          db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.MONTHLY_INCOME)) {
          db.createObjectStore(STORES.MONTHLY_INCOME, { keyPath: 'month' });
        }
        if (!db.objectStoreNames.contains(STORES.EXTRA_INCOME)) {
          db.createObjectStore(STORES.EXTRA_INCOME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    const request = fn(tx.objectStore(storeName));
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function monthKey(date) {
  return `${date.slice(0, 7)}-01`;
}

// --- Transactions ---------------------------------------------------------

export async function listTransactions() {
  return withStore(STORES.TRANSACTIONS, 'readonly', (store) => store.getAll());
}

export async function getTransaction(id) {
  return withStore(STORES.TRANSACTIONS, 'readonly', (store) => store.get(id));
}

export async function createTransaction({ date, amount, currency, category, raw_ocr_text = '' }) {
  const record = {
    id: newId(),
    date,
    amount: Math.round(parseFloat(amount) * 100) / 100,
    currency,
    category,
    raw_ocr_text,
    created_at: new Date().toISOString(),
  };
  await withStore(STORES.TRANSACTIONS, 'readwrite', (store) => store.put(record));
  return record;
}

export async function updateTransaction(id, { date, amount, currency, category }) {
  // A plain withStore() call won't do here: it's read-then-write (need the
  // existing record first to preserve created_at/raw_ocr_text), and its
  // generic onsuccess-result-capturing would clobber the get() handler
  // below that actually performs the write. Runs its own transaction
  // instead.
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TRANSACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.TRANSACTIONS);
    let updated = null;
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) return;
      updated = {
        ...existing,
        date,
        amount: Math.round(parseFloat(amount) * 100) / 100,
        currency,
        category,
      };
      store.put(updated);
    };
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTransaction(id) {
  return withStore(STORES.TRANSACTIONS, 'readwrite', (store) => store.delete(id));
}

// --- Monthly income (salary) -----------------------------------------------

export async function getMonthlyIncome(month) {
  const key = monthKey(month);
  const record = await withStore(STORES.MONTHLY_INCOME, 'readonly', (store) => store.get(key));
  return record || { month: key, amount: 0, currency: 'NGN' };
}

export async function setMonthlyIncome(month, amount, currency = 'NGN') {
  const record = {
    month: monthKey(month),
    amount: Math.round(parseFloat(amount) * 100) / 100,
    currency,
    updated_at: new Date().toISOString(),
  };
  await withStore(STORES.MONTHLY_INCOME, 'readwrite', (store) => store.put(record));
  return record;
}

// --- Extra income -----------------------------------------------------------

export async function listExtraIncome(month) {
  const key = monthKey(month);
  const all = await withStore(STORES.EXTRA_INCOME, 'readonly', (store) => store.getAll());
  return all.filter((entry) => entry.month === key).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function createExtraIncome(month, { amount, currency = 'NGN', description = '' }) {
  const record = {
    id: newId(),
    month: monthKey(month),
    amount: Math.round(parseFloat(amount) * 100) / 100,
    currency,
    description,
    created_at: new Date().toISOString(),
  };
  await withStore(STORES.EXTRA_INCOME, 'readwrite', (store) => store.put(record));
  return record;
}

export async function deleteExtraIncome(id) {
  return withStore(STORES.EXTRA_INCOME, 'readwrite', (store) => store.delete(id));
}
