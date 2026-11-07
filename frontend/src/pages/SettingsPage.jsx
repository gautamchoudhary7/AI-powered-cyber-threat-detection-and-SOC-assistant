import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiErrorMessage } from '../utils/format.js';
import { Card, ErrorBox, Field, buttonClass, inputClass } from '../components/ui.jsx';

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({ message: '', details: null });
  const [saved, setSaved] = useState(false);

  const trimmed = name.trim();
  const unchanged = trimmed === user?.name;

  async function handleSubmit(event) {
    event.preventDefault();
    setError({ message: '', details: null });
    setSaved(false);
    setBusy(true);
    try {
      await updateProfile(trimmed);
      setSaved(true);
    } catch (err) {
      setError({ message: apiErrorMessage(err, 'Could not save your name.'), details: err?.response?.data?.error?.details });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Profile">
      <form onSubmit={handleSubmit} className="space-y-3">
        <ErrorBox message={error.message} details={error.details} />
        <Field id="set-name" label="Name">
          <input id="set-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={80} className={inputClass} required />
        </Field>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-400">Email</dt><dd className="break-all">{user?.email}</dd>
          <dt className="text-slate-400">Role</dt><dd>{user?.role}</dd>
        </dl>
        <p className="text-xs text-slate-500">Your email and role cannot be changed here.</p>
        <div role="status" aria-live="polite" className="text-sm text-emerald-400">{saved ? 'Name saved.' : ''}</div>
        <button type="submit" disabled={busy || unchanged || trimmed.length < 2} className={buttonClass}>{busy ? 'Saving...' : 'Save name'}</button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({ message: '', details: null });
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= 10 && next === confirm;

  async function handleSubmit(event) {
    event.preventDefault();
    setError({ message: '', details: null });
    setDone(false);
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError({ message: apiErrorMessage(err, 'Could not change the password.'), details: err?.response?.data?.error?.details });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Change password">
      <form onSubmit={handleSubmit} className="space-y-3">
        <ErrorBox message={error.message} details={error.details} />
        <Field id="pw-current" label="Current password">
          <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} maxLength={72} className={inputClass} />
        </Field>
        <Field id="pw-new" label="New password" hint="10 to 72 characters, with at least one letter and one number.">
          <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} maxLength={72} className={inputClass} />
        </Field>
        <Field id="pw-confirm" label="Confirm new password">
          <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72} className={inputClass} aria-invalid={mismatch} aria-describedby={mismatch ? 'pw-mismatch' : undefined} />
        </Field>
        {mismatch && <p id="pw-mismatch" className="text-sm text-red-300">The two new passwords do not match.</p>}
        <p className="text-xs text-slate-500">Changing your password signs you out of every other browser or device. This one stays signed in.</p>
        <div role="status" aria-live="polite" className="text-sm text-emerald-400">{done ? 'Password changed. Other sessions were signed out.' : ''}</div>
        <button type="submit" disabled={busy || !ready} className={buttonClass}>{busy ? 'Changing...' : 'Change password'}</button>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  );
}
