import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { email: sessionEmail, loading, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailStatus, setEmailStatus] = useState({ text: '', tone: '' });
  const [codeStatus, setCodeStatus] = useState({ text: '', tone: '' });
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  if (loading) return null;
  if (sessionEmail) return <Navigate to="/dashboard" replace />;

  async function handleSendCode(event) {
    event.preventDefault();
    setSending(true);
    setEmailStatus({ text: 'Sending code...', tone: '' });
    try {
      const res = await apiFetch('/api/auth/request-otp/', { method: 'POST', body: { email } });
      const data = await res.json();
      if (res.ok) {
        setEmailStatus({ text: '', tone: '' });
        setStep('code');
      } else {
        setEmailStatus({ text: data.detail || 'Could not send the code.', tone: 'error' });
        setSending(false);
      }
    } catch {
      setEmailStatus({ text: 'Could not reach the server.', tone: 'error' });
      setSending(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    setVerifying(true);
    setCodeStatus({ text: 'Verifying...', tone: '' });
    try {
      const res = await apiFetch('/api/auth/verify-otp/', { method: 'POST', body: { email, code } });
      const data = await res.json();
      if (res.ok) {
        setCodeStatus({ text: 'Logged in — redirecting...', tone: 'success' });
        await refresh();
        navigate(location.state?.next || '/dashboard', { replace: true });
      } else {
        setCodeStatus({ text: data.detail || 'Invalid or expired code.', tone: 'error' });
        setVerifying(false);
      }
    } catch {
      setCodeStatus({ text: 'Could not reach the server.', tone: 'error' });
      setVerifying(false);
    }
  }

  function useDifferentEmail() {
    setStep('email');
    setSending(false);
    setCodeStatus({ text: '', tone: '' });
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
      <h2 style={{ marginTop: 0 }}>Log in</h2>
      <p className="muted">Enter your email and we'll send you a one-time code — no password needed.</p>

      {step === 'email' && (
        <form onSubmit={handleSendCode}>
          <input
            type="email"
            placeholder="you@example.com"
            style={{ width: '100%' }}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={sending} style={{ marginTop: '0.5rem', width: '100%' }}>
            Send code
          </button>
          <p className={`muted ${emailStatus.tone === 'error' ? 'error-text' : ''}`}>
            {emailStatus.text}
          </p>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleVerifyCode} style={{ marginTop: '1rem' }}>
          <p className="muted">Enter the 6-digit code sent to {email}.</p>
          <input
            type="text"
            placeholder="123456"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            style={{ width: '100%' }}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button type="submit" disabled={verifying} style={{ marginTop: '0.5rem', width: '100%' }}>
            Verify and log in
          </button>
          <button
            type="button"
            className="secondary"
            style={{ marginTop: '0.5rem', width: '100%' }}
            onClick={useDifferentEmail}
          >
            Use a different email
          </button>
          <p className={`muted ${codeStatus.tone === 'error' ? 'error-text' : codeStatus.tone === 'success' ? 'success-text' : ''}`}>
            {codeStatus.text}
          </p>
        </form>
      )}
    </div>
  );
}
