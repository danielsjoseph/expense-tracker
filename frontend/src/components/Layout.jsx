import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { email, logout } = useAuth();

  return (
    <>
      <header>
        <div>
          <Link to={email ? '/dashboard' : '/'} className="brand-link">
            <span className="brand">Expense Tracker</span>
          </Link>
          {email && (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/expenses">Update Expenses</Link>
              <Link to="/income">Update Income</Link>
            </>
          )}
        </div>
        {email && (
          <div>
            <span className="muted">{email}</span>
            <a href="/admin/">Admin</a>
            <a
              href="/logout/"
              onClick={(event) => {
                event.preventDefault();
                logout();
              }}
            >
              Log out
            </a>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
