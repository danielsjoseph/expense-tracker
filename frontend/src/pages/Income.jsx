import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { CURRENCIES } from '../lib/constants';

export default function Income() {
  const navigate = useNavigate();

  const [salary, setSalary] = useState('');
  const [salaryStatus, setSalaryStatus] = useState('');
  const [savingSalary, setSavingSalary] = useState(false);

  const [extraEntries, setExtraEntries] = useState(null);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraCurrency, setExtraCurrency] = useState('NGN');
  const [extraDescription, setExtraDescription] = useState('');
  const [extraStatus, setExtraStatus] = useState('');

  useEffect(() => {
    apiFetch('/api/income/current/')
      .then((res) => res.json())
      .then((data) => setSalary(data.amount));
    loadExtraIncome();
  }, []);

  function loadExtraIncome() {
    apiFetch('/api/income/extra/')
      .then((res) => res.json())
      .then((data) => setExtraEntries(data.results || data));
  }

  async function handleSaveSalary(event) {
    event.preventDefault();
    setSavingSalary(true);
    setSalaryStatus('Saving...');
    try {
      const res = await apiFetch('/api/income/current/', { method: 'POST', body: { amount: salary } });
      if (res.ok) {
        setSalaryStatus('Saved — returning to dashboard...');
        navigate('/dashboard');
      } else {
        setSalaryStatus('Could not save salary.');
        setSavingSalary(false);
      }
    } catch {
      setSalaryStatus('Could not reach the server.');
      setSavingSalary(false);
    }
  }

  async function handleAddExtra(event) {
    event.preventDefault();
    setExtraStatus('Adding...');
    try {
      const res = await apiFetch('/api/income/extra/', {
        method: 'POST',
        body: { amount: extraAmount, currency: extraCurrency, description: extraDescription },
      });
      if (res.ok) {
        setExtraStatus('Added.');
        setExtraAmount('');
        setExtraDescription('');
        loadExtraIncome();
      } else {
        const data = await res.json();
        setExtraStatus('Could not add: ' + JSON.stringify(data));
      }
    } catch {
      setExtraStatus('Could not reach the server.');
    }
  }

  async function handleDeleteExtra(id) {
    try {
      await apiFetch(`/api/income/extra/${id}/`, { method: 'DELETE' });
      loadExtraIncome();
    } catch {
      // leave the row as-is if the delete failed
    }
  }

  const extraTotal = (extraEntries || []).reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Update monthly salary</h2>
        <p className="muted">
          This sets your recurring income for the current calendar month, used for the
          dashboard's income-vs-spent breakdown. Kept on its own page so it isn't changed by
          accident from the main dashboard.
        </p>
        <form onSubmit={handleSaveSalary} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="number"
            step="0.01"
            min="0"
            style={{ maxWidth: 160 }}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
          <button type="submit" disabled={savingSalary}>
            Save salary
          </button>
          <Link to="/dashboard">
            <button type="button" className="secondary">
              Back to dashboard
            </button>
          </Link>
          <span className="muted">{salaryStatus}</span>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add extra income this month</h2>
        <p className="muted">
          For one-off money that came in this month (a gift, side gig, bonus...) — adds to this
          month's total income without changing your monthly salary above.
        </p>
        <form
          onSubmit={handleAddExtra}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount"
            style={{ maxWidth: 140 }}
            required
            value={extraAmount}
            onChange={(e) => setExtraAmount(e.target.value)}
          />
          <select value={extraCurrency} onChange={(e) => setExtraCurrency(e.target.value)}>
            {CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description (optional)"
            style={{ maxWidth: 220 }}
            value={extraDescription}
            onChange={(e) => setExtraDescription(e.target.value)}
          />
          <button type="submit">Add</button>
          <span className="muted">{extraStatus}</span>
        </form>

        <table style={{ marginTop: '1rem' }}>
          <thead>
            <tr>
              <th>Amount</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {extraEntries === null && (
              <tr>
                <td colSpan={3} className="muted">
                  Loading...
                </td>
              </tr>
            )}
            {extraEntries !== null && extraEntries.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No extra income added yet this month.
                </td>
              </tr>
            )}
            {(extraEntries || []).map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.amount} {entry.currency}
                </td>
                <td>{entry.description || '—'}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => handleDeleteExtra(entry.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Total extra income this month: {extraTotal.toFixed(2)}
        </p>
      </div>
    </>
  );
}
