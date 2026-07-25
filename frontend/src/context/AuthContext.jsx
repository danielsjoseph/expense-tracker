import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = not checked yet, null = anonymous, string = signed-in email
  const [email, setEmail] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch('/api/auth/me/');
      if (response.ok) {
        const data = await response.json();
        setEmail(data.email);
      } else {
        setEmail(null);
      }
    } catch {
      setEmail(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    window.location.href = '/logout/';
  }, []);

  return (
    <AuthContext.Provider value={{ email, loading: email === undefined, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
