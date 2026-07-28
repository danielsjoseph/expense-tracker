import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import CategoryDetail from './pages/CategoryDetail';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Income from './pages/Income';
import TransactionDetail from './pages/TransactionDetail';
import { seedDemoDataIfEmpty } from './lib/demoSeed';

/** Seeds sample data into a brand-new browser (once — checked against
 * IndexedDB itself, not any flag) before the app renders, so the
 * dashboard isn't empty on a first visit. */
function SeedGate({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedDemoDataIfEmpty().finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <SeedGate>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/category/:category" element={<CategoryDetail />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/income" element={<Income />} />
            <Route path="/transactions/:id" element={<TransactionDetail />} />
          </Route>
        </Routes>
      </SeedGate>
    </BrowserRouter>
  );
}
