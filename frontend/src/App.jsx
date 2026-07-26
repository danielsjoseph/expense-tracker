import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import CategoryDetail from './pages/CategoryDetail';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Home from './pages/Home';
import Income from './pages/Income';
import Login from './pages/Login';
import TransactionDetail from './pages/TransactionDetail';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/category/:category"
              element={
                <ProtectedRoute>
                  <CategoryDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/income"
              element={
                <ProtectedRoute>
                  <Income />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions/:id"
              element={
                <ProtectedRoute>
                  <TransactionDetail />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
