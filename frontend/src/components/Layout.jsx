import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Route changes (a nav link was clicked) should always close the mobile menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header>
        <Link to="/dashboard" className="brand-link">
          <span className="brand">Expense Tracker</span>
        </Link>

        <button
          type="button"
          className={`hamburger ${menuOpen ? 'open' : ''}`}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`nav-panel ${menuOpen ? 'open' : ''}`}>
          <div className="nav-links">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/expenses">Update Expenses</Link>
            <Link to="/income">Update Income</Link>
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
