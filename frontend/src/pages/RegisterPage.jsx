import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiErrorMessage } from '../utils/format.js';
import { ErrorBox, Field, buttonClass, inputClass } from '../components/ui.jsx';

// Same rules as the server. The server is the real check; this only saves a round trip.
export function passwordProblems(password) {
  const problems = [];
  if (password.length < 10) problems.push('at least 10 characters');
  if (password.length > 72) problems.push('at most 72 characters');
  if (!/[A-Za-z]/.test(password)) problems.push('at least one letter');
  if (!/\d/.test(password)) problems.push('at least one number');
  return problems;
}

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState({ message: '', details: null });
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const problems = passwordProblems(password);

  async function handleSubmit(event) {
    event.preventDefault();
    setError({ message: '', details: null });
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError({ message: apiErrorMessage(err, 'Registration failed.'), details: err?.response?.data?.error?.details });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-emerald-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Create an account</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ErrorBox message={error.message} details={error.details} />
        <Field id="name" label="Name">
          <input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field
          id="password"
          label="Password"
          hint={password && problems.length > 0 ? `Needs ${problems.join(', ')}.` : '10 to 72 characters, with at least one letter and one number.'}
        >
          <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <button type="submit" disabled={busy || name.trim().length < 2 || !email || problems.length > 0} className={`${buttonClass} w-full`}>
          {busy ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-400">
        Already registered?{' '}
        <Link to="/login" className="text-emerald-400 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
