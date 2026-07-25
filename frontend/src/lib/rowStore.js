// Unsaved receipt rows (images + extracted/edited fields) are kept in
// IndexedDB — a browser-local store, not the server — purely so a page
// reload doesn't throw away a confirm-in-progress batch. It never touches
// the network; it's read/written only by this tab. IndexedDB supports
// storing Blob/File values directly via structured clone, so the image
// itself round-trips along with the record.
const DB_NAME = 'expense-tracker-drafts';
const STORE_NAME = 'receiptRows';
const available = typeof indexedDB !== 'undefined';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function withStore(mode, fn) {
  if (!available) return null;
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const req = fn(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}

export const RowStore = {
  async getAll() {
    return (await withStore('readonly', (store) => store.getAll())) || [];
  },
  put(record) {
    return withStore('readwrite', (store) => store.put(record));
  },
  delete(id) {
    return withStore('readwrite', (store) => store.delete(id));
  },
  clear() {
    return withStore('readwrite', (store) => store.clear());
  },
};
