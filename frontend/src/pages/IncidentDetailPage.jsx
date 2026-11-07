import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addIncidentNote, getIncident, updateIncident } from '../api/client.js';
import { apiErrorMessage, formatDate, formatScore } from '../utils/format.js';
import GenerateReportButton from '../components/GenerateReportButton.jsx';
import AssistantPanel from '../components/AssistantPanel.jsx';
import {
  AlertStatusBadge, Card, EmptyState, ErrorBox, Field, INCIDENT_STATUS_LABELS, IncidentStatusBadge, SEVERITIES,
  SeverityBadge, Spinner, buttonClass, inputClass,
} from '../components/ui.jsx';

const NOTE_MAX = 5000;

export default function IncidentDetailPage() {
  const { id } = useParams();
  const [incident, setIncident] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Editable copy of the fields, kept apart from the saved incident until "Save changes".
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', status: 'open' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState({ message: '', details: null });
  const [saved, setSaved] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [noting, setNoting] = useState(false);
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getIncident(id)
      .then((data) => {
        if (cancelled) return;
        setIncident(data);
        setForm({ title: data.title, description: data.description, severity: data.severity, status: data.status });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) setNotFound(true);
        else setLoadError(apiErrorMessage(err, 'Could not load the incident.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const change = (field) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const dirty = incident && ['title', 'description', 'severity', 'status'].some((k) => form[k] !== incident[k]);

  async function handleSave(event) {
    event.preventDefault();
    setSaveError({ message: '', details: null });
    setSaved(false);
    setSaving(true);
    try {
      // Only fields that changed are sent.
      const changes = {};
      for (const k of ['title', 'description', 'severity', 'status']) if (form[k] !== incident[k]) changes[k] = form[k].trim?.() ?? form[k];
      const updated = await updateIncident(id, changes);
      setIncident((current) => ({ ...current, ...updated }));
      setForm({ title: updated.title, description: updated.description, severity: updated.severity, status: updated.status });
      setSaved(true);
    } catch (err) {
      setSaveError({ message: apiErrorMessage(err, 'Could not save the changes.'), details: err?.response?.data?.error?.details });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote(event) {
    event.preventDefault();
    setNoteError('');
    setNoting(true);
    try {
      const note = await addIncidentNote(id, noteText.trim());
      setIncident((current) => ({ ...current, notes: [...current.notes, note], noteCount: current.noteCount + 1 }));
      setNoteText('');
    } catch (err) {
      setNoteError(apiErrorMessage(err, 'Could not add the note.'));
    } finally {
      setNoting(false);
    }
  }

  if (notFound) return <EmptyState title="Incident not found">It may belong to another user. <Link to="/incidents" className="text-emerald-400 underline">Back to incidents</Link></EmptyState>;
  if (loadError) return <ErrorBox message={loadError} />;
  if (!incident) return <Spinner label="Loading incident..." />;

  return (
    <div className="space-y-4">
      <Link to="/incidents" className="text-sm text-emerald-400 underline">&larr; All incidents</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{incident.title}</h1>
        <SeverityBadge value={incident.severity} />
        <IncidentStatusBadge value={incident.status} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-400">Opened {formatDate(incident.createdAt)}</p>
        <GenerateReportButton request={{ type: 'incident', incidentId: incident.id }} label="Generate incident report" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Details">
          <form onSubmit={handleSave} className="space-y-3">
            <Field id="d-title" label="Title">
              <input id="d-title" value={form.title} onChange={change('title')} maxLength={200} className={inputClass} />
            </Field>
            <Field id="d-desc" label="Description">
              <textarea id="d-desc" value={form.description} onChange={change('description')} maxLength={5000} rows={4} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="d-status" label="Status">
                <select id="d-status" value={form.status} onChange={change('status')} className={inputClass}>
                  {Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field id="d-sev" label="Severity">
                <select id="d-sev" value={form.severity} onChange={change('severity')} className={inputClass}>
                  {[...SEVERITIES].reverse().map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <ErrorBox message={saveError.message} details={saveError.details} />
            <div role="status" aria-live="polite" className="text-sm text-emerald-400">{saved ? 'Changes saved.' : ''}</div>
            <button type="submit" disabled={!dirty || saving || form.title.trim().length < 3} className={buttonClass}>{saving ? 'Saving...' : 'Save changes'}</button>
          </form>
        </Card>

        <Card title={`Linked alerts (${incident.alerts.length})`}>
          {incident.alerts.length === 0 ? (
            <p className="text-sm text-slate-400">No alerts are linked. To link one, open an alert and choose &ldquo;Create incident from this alert&rdquo;.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {incident.alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <SeverityBadge value={a.severity} />
                  <span>{a.attackCategory || 'no category'}</span>
                  <span className="tabular-nums text-slate-400">score {formatScore(a.attackScore)}</span>
                  <AlertStatusBadge value={a.status} />
                  <span className="text-slate-500">{a.sourceFileName} (line {a.csvLine})</span>
                  <Link to={`/alerts/${a.id}`} className="ml-auto text-emerald-400 underline">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AssistantPanel target={{ incidentId: incident.id }} />

      <Card title={`Notes (${incident.notes.length})`}>
        {incident.notes.length === 0 && <p className="mb-3 text-sm text-slate-400">No notes yet. Record what you checked and what you found.</p>}
        <ul className="mb-4 space-y-3">
          {incident.notes.map((n) => (
            <li key={n.id} className="rounded-md border border-slate-800 bg-slate-950 p-3">
              <p className="text-xs text-slate-400">{n.author} &middot; {formatDate(n.createdAt)}</p>
              {/* Rendered as plain text by React; line breaks are kept. Never insert note text as HTML. */}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{n.text}</p>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddNote} className="space-y-2">
          <label htmlFor="note" className="block text-sm font-medium text-slate-200">Add a note</label>
          <textarea id="note" value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={NOTE_MAX} rows={3} className={inputClass} />
          <p className="text-xs text-slate-500">{noteText.length} / {NOTE_MAX}</p>
          <ErrorBox message={noteError} />
          <button type="submit" disabled={noting || noteText.trim().length === 0} className={buttonClass}>{noting ? 'Adding...' : 'Add note'}</button>
        </form>
      </Card>
    </div>
  );
}
