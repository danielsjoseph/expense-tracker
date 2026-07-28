import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filterTransactions } from '../lib/aggregations';

const PAGE_SIZE = 10;

function formatAmount(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Renders a filtered, paginated (10/page, with a "see all" toggle) slice
 * of an in-memory transactions array — everything lives in the browser
 * now, so there's no server round-trip or page-size query param anymore.
 * showCategory controls whether the category column is shown — the
 * category detail page hides it since every row is already that category.
 */
export default function TransactionsTable({ transactions, filters, showCategory = true }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setPage(1);
    setShowAll(false);
  }, [filters.category, filters.date_from, filters.date_to]);

  const filtered = useMemo(
    () =>
      [...filterTransactions(transactions, filters)].sort((a, b) =>
        a.date === b.date ? (a.created_at < b.created_at ? 1 : -1) : a.date < b.date ? 1 : -1
      ),
    [transactions, filters.category, filters.date_from, filters.date_to]
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageItems = showAll ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={showCategory ? 3 : 2} className="muted">
                No transactions in this range.
              </td>
            </tr>
          )}
          {pageItems.map((txn) => (
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
            <span className="muted">Showing all {filtered.length} transaction(s)</span>
            <button type="button" className="secondary" onClick={() => setShowAll(false)}>
              Paginate (10 per page)
            </button>
          </>
        ) : (
          <>
            <div>
              {page > 1 && (
                <button type="button" className="secondary" onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
              )}
              {page < totalPages && (
                <button
                  type="button"
                  className="secondary"
                  style={{ marginLeft: page > 1 ? '0.5rem' : 0 }}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              )}
            </div>
            <span className="muted">
              Page {page} of {totalPages} ({filtered.length} total)
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
