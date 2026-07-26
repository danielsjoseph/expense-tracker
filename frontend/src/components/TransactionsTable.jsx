import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';

const PAGE_SIZE = 10;
const ALL_PAGE_SIZE = 10000;

function formatAmount(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Fetches /api/transactions/ with the given filters, plus its own
 * pagination state (10/page, with a "see all" toggle). showCategory
 * controls whether the category column is shown — the category detail
 * page hides it since every row is already that one category.
 */
export default function TransactionsTable({ filters, showCategory = true }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState({ results: [], count: 0, next: null, previous: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(1);
    setShowAll(false);
  }, [filters.category, filters.date_from, filters.date_to]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    params.set('page_size', showAll ? ALL_PAGE_SIZE : PAGE_SIZE);
    if (!showAll) params.set('page', page);

    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/transactions/?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.category, filters.date_from, filters.date_to, page, showAll]);

  const totalPages = Math.ceil(data.count / PAGE_SIZE) || 1;

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showCategory && <th>Category</th>}
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {!loading && data.results.length === 0 && (
            <tr>
              <td colSpan={showCategory ? 3 : 2} className="muted">
                No transactions in this range.
              </td>
            </tr>
          )}
          {data.results.map((txn) => (
            <tr
              key={txn.id}
              className="clickable-row"
              onClick={() => navigate(`/transactions/${txn.id}`)}
            >
              <td>{txn.date}</td>
              {showCategory && <td>{txn.category || '—'}</td>}
              <td>
                {formatAmount(txn.amount)} {txn.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {showAll ? (
          <>
            <span className="muted">Showing all {data.count} transaction(s)</span>
            <button type="button" className="secondary" onClick={() => setShowAll(false)}>
              Paginate (10 per page)
            </button>
          </>
        ) : (
          <>
            <div>
              {!!data.previous && (
                <button type="button" className="secondary" onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
              )}
              {!!data.next && (
                <button
                  type="button"
                  className="secondary"
                  style={{ marginLeft: data.previous ? '0.5rem' : 0 }}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              )}
            </div>
            <span className="muted">
              Page {page} of {totalPages} ({data.count} total)
            </span>
            <button type="button" className="secondary" onClick={() => setShowAll(true)}>
              See all transactions
            </button>
          </>
        )}
      </div>
    </>
  );
}
