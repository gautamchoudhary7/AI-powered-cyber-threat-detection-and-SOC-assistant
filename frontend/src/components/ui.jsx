import { Loader2 } from 'lucide-react';
import { describeDetails } from '../utils/format.js';

// Every status is shown as TEXT as well as colour, so it is readable without telling colours apart.
const SEVERITY_STYLES = {
  critical: 'border-red-500/60 bg-red-950 text-red-200',
  high: 'border-orange-500/60 bg-orange-950 text-orange-200',
  medium: 'border-amber-500/60 bg-amber-950 text-amber-200',
  low: 'border-sky-500/60 bg-sky-950 text-sky-200',
};
const ALERT_STATUS_STYLES = {
  new: 'border-slate-500/60 bg-slate-800 text-slate-200',
  investigating: 'border-violet-500/60 bg-violet-950 text-violet-200',
  resolved: 'border-emerald-500/60 bg-emerald-950 text-emerald-200',
  false_positive: 'border-slate-600 bg-slate-900 text-slate-400',
};
const JOB_STATUS_STYLES = {
  queued: 'border-slate-500/60 bg-slate-800 text-slate-200',
  processing: 'border-sky-500/60 bg-sky-950 text-sky-200',
  completed: 'border-emerald-500/60 bg-emerald-950 text-emerald-200',
  failed: 'border-red-500/60 bg-red-950 text-red-200',
};

const INCIDENT_STATUS_STYLES = {
  open: 'border-amber-500/60 bg-amber-950 text-amber-200',
  investigating: 'border-violet-500/60 bg-violet-950 text-violet-200',
  contained: 'border-sky-500/60 bg-sky-950 text-sky-200',
  closed: 'border-slate-600 bg-slate-900 text-slate-400',
};
export const INCIDENT_STATUS_LABELS = {
  open: 'Open',
  investigating: 'Investigating',
  contained: 'Contained',
  closed: 'Closed',
};

export const ALERT_STATUS_LABELS = {
  new: 'New',
  investigating: 'Investigating',
  resolved: 'Resolved',
  false_positive: 'False positive',
};
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

function Pill({ styles, value, labels }) {
  const style = styles[value] || 'border-slate-600 bg-slate-900 text-slate-300';
  const text = labels?.[value] ?? (value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown');
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${style}`}>{text}</span>;
}

export const SeverityBadge = ({ value }) => <Pill styles={SEVERITY_STYLES} value={value} />;
export const AlertStatusBadge = ({ value }) => <Pill styles={ALERT_STATUS_STYLES} value={value} labels={ALERT_STATUS_LABELS} />;
export const IncidentStatusBadge = ({ value }) => <Pill styles={INCIDENT_STATUS_STYLES} value={value} labels={INCIDENT_STATUS_LABELS} />;
export const JobStatusBadge =({ value }) => <Pill styles={JOB_STATUS_STYLES} value={value} />;

export function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-400" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

// Errors are announced to screen readers (role="alert") and can list extra details.
export function ErrorBox({ message, details }) {
  if (!message) return null;
  const lines = describeDetails(details);
  return (
    <div role="alert" className="rounded-lg border border-red-500/50 bg-red-950/60 p-3 text-sm text-red-200">
      <p className="font-medium">{message}</p>
      {lines.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-red-300">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center">
      <p className="font-medium text-slate-200">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-400">{children}</div>}
    </div>
  );
}

export function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-slate-900 p-4 ${className}`}>
      {title && <h2 className="mb-3 font-medium text-slate-100">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

export function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-200">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
