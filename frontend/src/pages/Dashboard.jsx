import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import CategoryDoughnutChart from '../components/CategoryDoughnutChart';
import DailyLineChart from '../components/DailyLineChart';
import IncomePieChart from '../components/IncomePieChart';
import TransactionsTable from '../components/TransactionsTable';

function formatAmount(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const category = searchParams.get('category') || '';
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';

  const [summary, setSummary] = useState(null);
  const [formCategory, setFormCategory] = useState(category);
  const [formDateFrom, setFormDateFrom] = useState(dateFrom);
  const [formDateTo, setFormDateTo] = useState(dateTo);

  useEffect(() => {
    setFormCategory(category);
    setFormDateFrom(dateFrom);
    setFormDateTo(dateTo);
  }, [category, dateFrom, dateTo]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    let cancelled = false;
    apiFetch(`/api/dashboard/summary/?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setSummary(json);
      });
    return () => {
      cancelled = true;
    };
  }, [category, dateFrom, dateTo]);

  function applyFilters(event) {
    event.preventDefault();
    const params = {};
    if (formCategory) params.category = formCategory;
    if (formDateFrom) params.date_from = formDateFrom;
    if (formDateTo) params.date_to = formDateTo;
    setSearchParams(params);
  }

  function clearFilters() {
    setSearchParams({});
  }

  function clearCategoryOnly() {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    setSearchParams(params);
  }

  function goToCategory(label) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString();
    navigate(`/dashboard/category/${encodeURIComponent(label)}${qs ? `?${qs}` : ''}`);
  }

  const exportUrl = (() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString();
    return `/export/csv/${qs ? `?${qs}` : ''}`;
  })();

  if (!summary) return null;

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Monthly income</h2>
          <button type="button" className="secondary" onClick={() => navigate('/income')}>
            Update Income
          </button>
        </div>
        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div className="muted">Income this month</div>
            <div className="stat">{formatAmount(summary.monthly_income)}</div>
            {!!summary.extra_income && (
              <div className="muted">
                ({formatAmount(summary.base_income)} salary + {formatAmount(summary.extra_income)} extra)
              </div>
            )}
          </div>
          <div>
            <div className="muted">Spent this month</div>
            <div className="stat">{formatAmount(summary.month_spent)}</div>
          </div>
          <div>
            <div className="muted">Remaining</div>
            <div className="stat">{formatAmount(summary.month_remaining)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="muted">Total spend (filtered)</div>
        <div className="stat">{formatAmount(summary.total)}</div>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: '0.5rem' }}>
          Spend this month, day by day
        </div>
        <DailyLineChart labels={summary.day_labels} totals={summary.day_totals} />
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: '0.5rem' }}>
          Income vs. spent (this month)
        </div>
        {summary.income_pie_labels.length ? (
          <IncomePieChart labels={summary.income_pie_labels} totals={summary.income_pie_totals} />
        ) : (
          <p className="muted">Set your monthly income above to see this breakdown.</p>
        )}
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: '0.5rem' }}>
          Spend by category — click a slice to filter the list below
        </div>
        {summary.category_chart_labels.length ? (
          <>
            <CategoryDoughnutChart
              labels={summary.category_chart_labels}
              totals={summary.category_chart_totals}
              onSliceClick={goToCategory}
            />
            {!!category && (
              <p className="muted" style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                Filtered to <strong>{category}</strong> —{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); clearCategoryOnly(); }}>
                  clear
                </a>
              </p>
            )}
          </>
        ) : (
          <p className="muted">No spend yet — add a transaction to see the breakdown.</p>
        )}
      </div>

      <div className="card">
        <form className="filters" onSubmit={applyFilters}>
          <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
            <option value="">All categories</option>
            {summary.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <input type="date" value={formDateFrom} onChange={(e) => setFormDateFrom(e.target.value)} />
          <input type="date" value={formDateTo} onChange={(e) => setFormDateTo(e.target.value)} />
          <button type="submit">Filter</button>
          <button type="button" className="secondary" onClick={clearFilters}>
            Clear
          </button>
          <a href={exportUrl}>
            <button type="button" className="secondary">
              Export CSV
            </button>
          </a>
        </form>

        <TransactionsTable filters={{ category, date_from: dateFrom, date_to: dateTo }} />
      </div>
    </>
  );
}
