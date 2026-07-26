import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { CATEGORIES, CURRENCIES } from '../lib/constants';

export default function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [status, setStatus] = useState({ text: '', tone: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/transactions/${id}/`).then(async (res) => {
      if (cancelled) return;
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setTransaction(data);
      setDate(data.date);
      setAmount(data.amount);
      setCurrency(data.currency);
      setCategory(data.category);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setStatus({ text: 'Saving...', tone: '' });
    try {
      const res = await apiFetch(`/api/transactions/${id}/`, {
        method: 'PATCH',
        body: { date, amount, currency, category },
      });
      if (res.ok) {
        const data = await res.json();
        setTransaction(data);
        setStatus({ text: 'Saved.', tone: 'success' });
      } else {
        const data = await res.json();
        setStatus({ text: 'Could not save: ' + JSON.stringify(data), tone: 'error' });
      }
    } catch {
      setStatus({ text: 'Could not reach the server.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/transactions/${id}/`, { method: 'DELETE' });
      if (res.ok) {
        navigate('/dashboard');
      } else {
        setStatus({ text: 'Could not delete this transaction.', tone: 'error' });
        setDeleting(false);
      }
    } catch {
      setStatus({ text: 'Could not reach the server.', tone: 'error' });
      setDeleting(false);
    }
  }

  if (notFound) {
    return (
      <div className="card">
        <p>Transaction not found.</p>
        <Link to="/dashboard">
          <button type="button" className="secondary">
            Back to dashboard
          </button>
        </Link>
      </div>
    );
  }

  if (!transaction) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Transaction details</h2>
        <button type="button" className="secondary" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      <form onSubmit={handleSave} style={{ marginTop: '1rem' }}>
        <table>
          <tbody>
            <tr>
              <td>Date</td>
              <td>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </td>
            </tr>
            <tr>
              <td>Amount</td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td>Currency</td>
              <td>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
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

        <button type="submit" disabled={saving}>
          Save changes
        </button>{' '}
        <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
          Delete transaction
        </button>{' '}
        <span
          className={`muted ${status.tone === 'error' ? 'error-text' : status.tone === 'success' ? 'success-text' : ''}`}
        >
          {status.text}
        </span>
      </form>

      {transaction.raw_ocr_text && (
        <details style={{ marginTop: '1rem' }}>
          <summary className="muted">Raw OCR text (from original extraction)</summary>
          <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>
            {transaction.raw_ocr_text}
          </pre>
        </details>
      )}
    </div>
  );
}
