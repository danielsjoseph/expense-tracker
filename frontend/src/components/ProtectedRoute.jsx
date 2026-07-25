import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { email, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!email) {
    return <Navigate to="/login" state={{ next: location.pathname }} replace />;
  }
  return children;
}
