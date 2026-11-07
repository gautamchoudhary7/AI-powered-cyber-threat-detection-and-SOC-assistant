import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { createIncident, listIncidents } from '../api/client.js';
import { apiErrorMessage, formatCount, formatDate } from '../utils/format.js';
import {
  Card, EmptyState, ErrorBox, Field, INCIDENT_STATUS_LABELS, IncidentStatusBadge, SEVERITIES, SeverityBadge, Spinner,
  buttonClass, inputClass, secondaryButtonClass,
} from '../components/ui.jsx';

const LIMIT = 20;

function NewIncidentForm({ onCancel }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({ message: '', details: null });

  async function handleSubmit(event) {
    event.preventDefault();
    setError({ message: '', details: null });
    setBusy(true);
    try {
      const incident = await createIncident({ title: title.trim(), description: description.trim() || undefined, severity });
      navigate(`/incidents/${incident.id}`);
    } catch (err) {
      setError({ message: apiErrorMessage(err, 'Could not create the incident.'), details: err?.response?.data?.error?.details });
      setBusy(false);
    }
  }

  return (
    <Card title="New incident">
      <form onSubmit={handleSubmit} className="space-y-3">
        <ErrorBox message={error.message} details={error.details} />
        <Field id="inc-title" label="Title" hint="At least 3 characters.">
          <input id="inc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} required />
        </Field>
        <Field id="inc-desc" label="Description (optional)">
          <textarea id="inc-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} className={inputClass} />
        </Field>
        <Field id="inc-sev" label="Severity">
          <select id="inc-sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputClass}>
            {[...SEVERITIES].reverse().map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || title.trim().length < 3} className={buttonClass}>{busy ? 'Creating...' : 'Create incident'}</button>
          <button type="button" onClick={onCancel} disabled={busy} className={secondaryButtonClass}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

export default function IncidentsPage() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '', items: [], pagination: null });
  const [showForm, setShowForm] = useState(false);

  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const status = params.get('status') || '';
  const severity = params.get('severity') || '';

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const query = { page, limit: LIMIT };
    if (status) query.status = status;
    if (severity) query.severity = severity;
    listIncidents(query)
      .then((res) => !cancelled && setState({ loading: false, error: '', items: res.data, pagination: res.pagination }))
      .catch((err) => !cancelled && setState({ loading: false, error: apiErrorMessage(err, 'Could not load incidents.'), items: [], pagination: null }));
    return () => {
      cancelled = true;
    };
  }, [page, status, severity]);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  const filtered = Boolean(status || severity);
  const { loading, error, items, pagination } = state;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Incidents</h1>
          <p className="mt-1 text-sm text-slate-400">Track an investigation: link alerts, set a status and keep notes.</p>
        </div>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)} className={buttonClass}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New incident
          </button>
        )}
      </div>

      {showForm && <NewIncidentForm onCancel={() => setShowForm(false)} />}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="i-status" className="mb-1 block text-xs text-slate-400">Status</label>
          <select id="i-status" value={status} onChange={(e) => setParam('status', e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="i-sev" className="mb-1 block text-xs text-slate-400">Severity</label>
          <select id="i-sev" value={severity} onChange={(e) => setParam('severity', e.target.value)} className={inputClass}>
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        {filtered && <button type="button" onClick={() => setParams(new URLSearchParams())} className={secondaryButtonClass}>Clear filters</button>}
      </div>

      <ErrorBox message={error} />
      {loading && <Spinner label="Loading incidents..." />}

      {!loading && !error && items.length === 0 && (
        <EmptyState title={filtered ? 'No incidents match these filters' : 'No incidents yet'}>
          {filtered ? 'Try clearing a filter.' : 'Create one here, or open an alert and choose "Create incident from this alert".'}
        </EmptyState>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Incidents</caption>
              <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-2">Title</th>
                  <th scope="col" className="px-3 py-2">Severity</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Alerts</th>
                  <th scope="col" className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-900/60">
                    <td className="max-w-[24rem] truncate px-3 py-2"><Link to={`/incidents/${i.id}`} className="text-emerald-400 underline">{i.title}</Link></td>
                    <td className="px-3 py-2"><SeverityBadge value={i.severity} /></td>
                    <td className="px-3 py-2"><IncidentStatusBadge value={i.status} /></td>
                    <td className="px-3 py-2 tabular-nums">{formatCount(i.alertCount)}</td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-slate-400">
            <span>Page {pagination.page} of {pagination.pages} ({formatCount(pagination.total)} incidents)</span>
            <span className="flex gap-2">
              <button type="button" className={secondaryButtonClass} disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>Previous</button>
              <button type="button" className={secondaryButtonClass} disabled={page >= pagination.pages} onClick={() => setParam('page', String(page + 1))}>Next</button>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
