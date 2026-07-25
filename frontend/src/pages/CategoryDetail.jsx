import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import CategoryDoughnutChart from '../components/CategoryDoughnutChart';
import TransactionsTable from '../components/TransactionsTable';

function formatAmount(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CategoryDetail() {
  const { category } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  const [formDateFrom, setFormDateFrom] = useState(dateFrom);
  const [formDateTo, setFormDateTo] = useState(dateTo);
  const [summary, setSummary] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setFormDateFrom(dateFrom);
    setFormDateTo(dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    let cancelled = false;
    setNotFound(false);
    apiFetch(`/api/dashboard/category/${encodeURIComponent(category)}/summary/?${params.toString()}`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json) setSummary(json);
      });
    return () => {
      cancelled = true;
    };
  }, [category, dateFrom, dateTo]);

  function applyFilters(event) {
    event.preventDefault();
    const params = {};
    if (formDateFrom) params.date_from = formDateFrom;
    if (formDateTo) params.date_to = formDateTo;
    setSearchParams(params);
  }

  function clearFilters() {
    setSearchParams({});
  }

  function goToCategory(label) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString();
    navigate(`/dashboard/category/${encodeURIComponent(label)}${qs ? `?${qs}` : ''}`);
  }

  if (notFound) {
    return (
      <div className="card">
        <p>Unknown category.</p>
        <Link to="/dashboard">
          <button type="button" className="secondary">
            Back to dashboard
          </button>
        </Link>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{category}</h2>
          <Link to="/dashboard">
            <button type="button" className="secondary">
              Back to dashboard
            </button>
          </Link>
        </div>
        <div className="muted" style={{ marginTop: '1rem' }}>
          Total spend
        </div>
        <div className="stat">{formatAmount(summary.total)}</div>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: '0.5rem' }}>
          Spend by category — click a slice to jump to it
        </div>
        {summary.category_chart_labels.length ? (
          <CategoryDoughnutChart
            labels={summary.category_chart_labels}
            totals={summary.category_chart_totals}
            activeCategory={category}
            onSliceClick={goToCategory}
          />
        ) : (
          <p className="muted">No spend yet in this range.</p>
        )}
      </div>

      <div className="card">
        <form className="filters" onSubmit={applyFilters}>
          <input type="date" value={formDateFrom} onChange={(e) => setFormDateFrom(e.target.value)} />
          <input type="date" value={formDateTo} onChange={(e) => setFormDateTo(e.target.value)} />
          <button type="submit">Filter</button>
          <button type="button" className="secondary" onClick={clearFilters}>
            Clear
          </button>
        </form>

        <TransactionsTable filters={{ category, date_from: dateFrom, date_to: dateTo }} showCategory={false} />
      </div>
    </>
  );
}
