import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client';
import ReceiptRowCard from '../components/ReceiptRowCard';
import { CATEGORIES, CURRENCIES } from '../lib/constants';
import { extractTransactionFields, terminateOcrWorker } from '../lib/ocr/pipeline';
import { RowStore } from '../lib/rowStore';

function todayIso() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

async function createTransaction(payload) {
  return apiFetch('/api/transactions/', { method: 'POST', body: payload });
}

export default function Expenses() {
  // Manual entry form
  const [manualDate, setManualDate] = useState(todayIso());
  const [manualAmount, setManualAmount] = useState('');
  const [manualCurrency, setManualCurrency] = useState('NGN');
  const [manualCategory, setManualCategory] = useState(CATEGORIES[0]);
  const [manualStatus, setManualStatus] = useState({ text: '', tone: '' });
  const manualStatusToken = useRef(0);

  // Receipt upload + confirm rows
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [rowStatuses, setRowStatuses] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllStatus, setSaveAllStatus] = useState({ text: '', tone: '' });

  // Restore any unsaved batch left over from before a reload.
  useEffect(() => {
    RowStore.getAll().then((records) => {
      if (!records.length) return;
      const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : 1));
      setRows(sorted);
      setExtractStatus(`Restored ${sorted.length} unsaved receipt(s) from before the reload.`);
    });
  }, []);

  // Release the OCR worker (and its WASM memory) once this page is left.
  useEffect(() => () => terminateOcrWorker(), []);

  function flashSuccess(setStatus, text, onExpire) {
    const token = ++manualStatusToken.current;
    setStatus({ text, tone: 'success' });
    setTimeout(() => {
      if (manualStatusToken.current !== token) return; // a newer message took over first
      setStatus({ text: '', tone: '' });
      if (onExpire) onExpire();
    }, 5000);
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    setManualStatus({ text: 'Saving...', tone: '' });
    const payload = { date: manualDate, amount: manualAmount, currency: manualCurrency, category: manualCategory };
    try {
      const res = await createTransaction(payload);
      if (res.ok) {
        flashSuccess(setManualStatus, 'Expense added successfully!');
        setManualDate(todayIso());
        setManualAmount('');
        setManualCurrency('NGN');
        setManualCategory(CATEGORIES[0]);
      } else {
        const data = await res.json();
        setManualStatus({ text: 'Could not save: ' + JSON.stringify(data), tone: 'error' });
      }
    } catch {
      setManualStatus({ text: 'Could not reach the server.', tone: 'error' });
    }
  }

  async function handleExtract() {
    const files = Array.from(fileInputRef.current?.files || []);
    if (!files.length) {
      setExtractStatus('Choose at least one image first.');
      return;
    }

    setExtracting(true);
    // A fresh extraction replaces whatever unsaved batch was showing.
    await RowStore.clear();
    const newRows = [];
    setRows([]);
    setRowStatuses({});

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setExtractStatus(`Extracting receipt ${index + 1} of ${files.length} (running in your browser)...`);

      const base = {
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        filename: file.name || `Receipt ${index + 1}`,
        imageBlob: file,
      };
      let record;
      try {
        // Runs entirely client-side — the image itself is never uploaded.
        const result = await extractTransactionFields(file);
        record = {
          ...base,
          date: result.date || todayIso(),
          amount: result.amount ?? '',
          currency: 'NGN',
          category: result.category || 'Other',
          raw_ocr_text: result.raw_ocr_text || '',
          error: '',
        };
      } catch (err) {
        // A single unreadable image shouldn't sink the rest of the batch.
        record = {
          ...base,
          date: todayIso(),
          amount: '',
          currency: 'NGN',
          category: 'Other',
          raw_ocr_text: '',
          error: err.message || 'Could not read this image.',
        };
      }
      RowStore.put(record);
      newRows.push(record);
      setRows([...newRows]);
    }

    setExtractStatus(`Extracted ${newRows.length} receipt(s) — review and confirm below.`);
    setExtracting(false);
  }

  function handleFieldChange(id, field, value) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, [field]: value } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) RowStore.put(updated);
      return next;
    });
  }

  function handleRemoveRow(id) {
    RowStore.delete(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setRowStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleSaveAll() {
    if (!rows.length) {
      setSaveAllStatus({ text: 'No receipts left to save.', tone: '' });
      return;
    }

    setSavingAll(true);
    setSaveAllStatus({ text: `Saving ${rows.length} receipt(s)...`, tone: '' });

    const outcomes = await Promise.all(
      rows.map(async (row) => {
        const payload = { date: row.date, amount: row.amount, currency: row.currency, category: row.category };
        try {
          const res = await createTransaction(payload);
          if (res.ok) {
            setRowStatuses((prev) => ({ ...prev, [row.id]: { text: 'Saved', tone: 'success' } }));
            return { id: row.id, success: true };
          }
          const data = await res.json();
          setRowStatuses((prev) => ({
            ...prev,
            [row.id]: { text: 'Failed: ' + JSON.stringify(data), tone: 'error' },
          }));
          return { id: row.id, success: false };
        } catch {
          setRowStatuses((prev) => ({
            ...prev,
            [row.id]: { text: 'Could not reach the server.', tone: 'error' },
          }));
          return { id: row.id, success: false };
        }
      })
    );

    const savedIds = new Set(outcomes.filter((o) => o.success).map((o) => o.id));
    savedIds.forEach((id) => RowStore.delete(id));
    setRows((prev) => prev.filter((r) => !savedIds.has(r.id)));

    if (fileInputRef.current) fileInputRef.current.value = '';

    const savedCount = savedIds.size;
    if (savedCount === outcomes.length) {
      setExtractStatus('');
      flashSuccess(setSaveAllStatus, `All ${savedCount} expense(s) saved successfully!`);
    } else {
      setSaveAllStatus({
        text: `Saved ${savedCount} of ${outcomes.length}. Fix and retry the rest below.`,
        tone: 'error',
      });
    }
    setSavingAll(false);
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add an expense manually</h2>
        <p className="muted">Don't have a receipt photo? Enter the transaction directly.</p>
        <form onSubmit={handleManualSubmit}>
          <table>
            <tbody>
              <tr>
                <td>Date</td>
                <td>
                  <input type="date" required value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
                </td>
              </tr>
              <tr>
                <td>Amount</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td>Currency</td>
                <td>
                  <select value={manualCurrency} onChange={(e) => setManualCurrency(e.target.value)}>
                    {CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td>Category</td>
                <td>
                  <select value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
          <button type="submit">Add expense</button>{' '}
          <span className={`muted ${manualStatus.tone === 'error' ? 'error-text' : manualStatus.tone === 'success' ? 'success-text' : ''}`}>
            {manualStatus.text}
          </span>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Or upload receipt photos</h2>
        <p className="muted">
          Select one or more receipt images. OCR runs entirely in your browser — the images
          are never uploaded anywhere; only the fields you confirm below get sent to the
          server, as a new transaction. Unsaved images and edits stick around in this browser
          if you reload the page.
        </p>
        <input type="file" ref={fileInputRef} accept="image/*" multiple />
        <button type="button" onClick={handleExtract} disabled={extracting}>
          Extract details
        </button>
        <p className="muted">{extractStatus}</p>
      </div>

      {rows.map((record) => (
        <ReceiptRowCard
          key={record.id}
          record={record}
          status={rowStatuses[record.id]}
          onFieldChange={handleFieldChange}
          onRemove={handleRemoveRow}
        />
      ))}

      {(rows.length > 0 || saveAllStatus.text) && (
        <div className="card">
          <button type="button" onClick={handleSaveAll} disabled={savingAll}>
            Save all transactions
          </button>{' '}
          <span className={`muted ${saveAllStatus.tone === 'error' ? 'error-text' : saveAllStatus.tone === 'success' ? 'success-text' : ''}`}>
            {saveAllStatus.text}
          </span>
        </div>
      )}
    </>
  );
}
