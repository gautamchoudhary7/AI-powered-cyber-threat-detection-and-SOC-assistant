import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiErrorMessage } from '../utils/format.js';
import { safeDestination } from '../utils/safeRedirect.js';
import { ErrorBox, Field, buttonClass, inputClass } from '../components/ui.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const destination = safeDestination(location.state?.from?.pathname);
  if (user) return <Navigate to={destination} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Login failed. Please try again.'));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-emerald-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Log in to SOC Assistant</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <button type="submit" disabled={busy || !email || !password} className={`${buttonClass} w-full`}>
          {busy ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-400">
        No account yet?{' '}
        <Link to="/register" className="text-emerald-400 underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
