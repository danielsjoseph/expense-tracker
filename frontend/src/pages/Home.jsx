import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { email, loading } = useAuth();

  if (loading) return null;
  if (email) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <div style={{ textAlign: 'center', padding: '2rem 0 1rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Snap a receipt. That's the whole job.</h1>
        <p className="muted" style={{ fontSize: '1.05rem', maxWidth: 520, margin: '0 auto' }}>
          Upload a photo, OCR reads the merchant/date/amount/category for you, you confirm it,
          and it's logged. No receipt on hand? Type it in manually instead — either way it
          lands in the same dashboard.
        </p>
        <Link to="/login">
          <button style={{ marginTop: '1.25rem', padding: '0.7rem 1.5rem', fontSize: '1rem' }}>
            Log in to get started
          </button>
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
        }}
      >
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📷 Upload a receipt, get a transaction</h3>
          <p className="muted">
            Select one or more receipt photos. Each one is preprocessed (grayscale, denoise,
            deskew) and run through Tesseract OCR to pull out the date, amount, currency, and a
            guessed category — reviewed side-by-side with the actual image before anything saves.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>🔒 Your photos are never stored</h3>
          <p className="muted">
            Images are processed entirely in memory — never written to disk, a database, or any
            file field. Only the structured numbers you confirm get saved. There's no way to
            retrieve the original photo later, because it was never kept.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>✏️ No photo? Type it in</h3>
          <p className="muted">
            The Update Expenses page has a manual-entry form right alongside the upload flow, for
            cash purchases, lost receipts, or anything you'd rather just type in directly.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>💰 Multi-currency, fixed categories</h3>
          <p className="muted">
            Every transaction gets a currency (NGN, USD, EUR, GBP) and a category (Groceries,
            Transport, Dining, Utilities, Entertainment, Other) — consistent dropdowns, no
            free-text drift over time.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>📈 Income, tracked two ways</h3>
          <p className="muted">
            Set a recurring monthly salary once, then log one-off extra income (a gift, a side
            gig) as it comes in — without ever touching the salary figure itself. The dashboard
            shows both combined.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>📊 One dashboard for all of it</h3>
          <p className="muted">
            Daily spend for the current month, income vs. spent at a glance, filter by category
            or date range, paginated transaction history, and CSV export with a running total.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>🔑 No passwords to manage</h3>
          <p className="muted">
            Log in with just your email — a one-time 6-digit code is sent to your inbox and
            expires in 10 minutes. Nothing to remember, nothing stored that could leak as a
            reusable password.
          </p>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '2rem 0 1rem' }}>
        <Link to="/login">
          <button style={{ padding: '0.7rem 1.5rem', fontSize: '1rem' }}>
            Log in to get started
          </button>
        </Link>
      </div>
    </>
  );
}
