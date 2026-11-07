import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createIncident, getAlert, updateAlertStatus } from '../api/client.js';
import { apiErrorMessage, formatDate, formatScore } from '../utils/format.js';
import AssistantPanel from '../components/AssistantPanel.jsx';
import {
  ALERT_STATUS_LABELS, AlertStatusBadge, Card, EmptyState, ErrorBox, SeverityBadge, Spinner,
  buttonClass, inputClass, secondaryButtonClass,
} from '../components/ui.jsx';

export default function AlertDetailPage() {
  const { id } = useParams();
  const [alert, setAlert] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // One click: opens an incident linked to this alert, using the alert's severity. It can be renamed afterwards.
  async function handleCreateIncident() {
    setCreateError('');
    setCreating(true);
    try {
      const title = `Investigate ${alert.attackCategory || 'flagged traffic'} (${alert.sourceFileName}, line ${alert.csvLine})`.slice(0, 200);
      const incident = await createIncident({ title, severity: alert.severity, alertIds: [alert.id] });
      navigate(`/incidents/${incident.id}`);
    } catch (err) {
      setCreateError(apiErrorMessage(err, 'Could not create the incident.'));
      setCreating(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getAlert(id)
      .then((a) => {
        if (cancelled) return;
        setAlert(a);
        setNewStatus(a.status);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) setNotFound(true);
        else setLoadError(apiErrorMessage(err, 'Could not load the alert.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(event) {
    event.preventDefault();
    setSaveError('');
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateAlertStatus(id, newStatus);
      setAlert((current) => ({ ...current, ...updated }));
      setSaved(true);
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not change the status.'));
    } finally {
      setSaving(false);
    }
  }

  if (notFound) return <EmptyState title="Alert not found">It may belong to another user. <Link to="/alerts" className="text-emerald-400 underline">Back to alerts</Link></EmptyState>;
  if (loadError) return <ErrorBox message={loadError} />;
  if (!alert) return <Spinner label="Loading alert..." />;

  // Values are rendered as plain text by React, which escapes them. Never insert them as HTML.
  const recordEntries = Object.entries(alert.record || {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <Link to="/alerts" className="text-sm text-emerald-400 underline">&larr; All alerts</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Alert from {alert.sourceFileName}, line {alert.csvLine}</h1>
        <SeverityBadge value={alert.severity} />
        <AlertStatusBadge value={alert.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Model prediction">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-400">Predicted label</dt><dd>{alert.predictedLabel}</dd>
            <dt className="text-slate-400">Attack score</dt><dd className="tabular-nums">{formatScore(alert.attackScore)}</dd>
            <dt className="text-slate-400">Likely category</dt>
            <dd>{alert.attackCategory || 'none'}{alert.categoryConfidence != null && ` (score ${formatScore(alert.categoryConfidence)})`}</dd>
            <dt className="text-slate-400">Model version</dt><dd className="break-all">{alert.modelVersion}</dd>
            <dt className="text-slate-400">Created</dt><dd>{formatDate(alert.createdAt)}</dd>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            This is a statistical prediction, not a confirmed attack. The score is not a calibrated probability, and the
            category is the second model&apos;s best guess. Severity is a sorting rule based on the score. Check the
            underlying traffic before acting.
          </p>
          {alert.jobId && (
            <p className="mt-3 text-sm">
              <Link to={`/jobs/${alert.jobId}`} className="text-emerald-400 underline">View the analysis this came from</Link>
            </p>
          )}
        </Card>

        <Card title="Investigation status">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label htmlFor="status" className="mb-1 block text-sm text-slate-300">Status</label>
              <select id="status" value={newStatus} onChange={(e) => { setNewStatus(e.target.value); setSaved(false); }} className={inputClass}>
                {Object.entries(ALERT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <ErrorBox message={saveError} />
            <div role="status" aria-live="polite" className="text-sm text-emerald-400">{saved ? 'Status saved.' : ''}</div>
            <button type="submit" disabled={saving || newStatus === alert.status} className={buttonClass}>
              {saving ? 'Saving...' : 'Save status'}
            </button>
          </form>
          <div className="mt-4 border-t border-slate-800 pt-4">
            <ErrorBox message={createError} />
            <button type="button" onClick={handleCreateIncident} disabled={creating} className={secondaryButtonClass}>
              {creating ? 'Creating...' : 'Create incident from this alert'}
            </button>
          </div>
        </Card>
      </div>

      <AssistantPanel target={{ alertId: alert.id }} />

      <Card title="Row values the model used">
        {recordEntries.length === 0 ? (
          <p className="text-sm text-slate-400">No row values were stored for this alert.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Values from the flagged CSV row</caption>
              <thead className="text-xs uppercase text-slate-400">
                <tr><th scope="col" className="px-2 py-1">Column</th><th scope="col" className="px-2 py-1">Value</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recordEntries.map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row" className="px-2 py-1 font-normal text-slate-300">{key}</th>
                    <td className="px-2 py-1 font-mono">{value === null || value === '' ? <span className="text-slate-500">(empty)</span> : String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
