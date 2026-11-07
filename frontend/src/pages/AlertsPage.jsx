import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listAlerts } from '../api/client.js';
import { apiErrorMessage, formatCount, formatDate, formatScore } from '../utils/format.js';
import {
  ALERT_STATUS_LABELS, AlertStatusBadge, EmptyState, ErrorBox, SEVERITIES, SeverityBadge, Spinner,
  inputClass, secondaryButtonClass,
} from '../components/ui.jsx';

const LIMIT = 20;
const SORTS = { createdAt: 'Newest first', severity: 'Severity', confidence: 'Attack score' };

export default function AlertsPage() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '', items: [], pagination: null });
  const [categoryDraft, setCategoryDraft] = useState(params.get('category') || '');

  // The address bar is the single source of truth, so filtered views can be bookmarked and the Back button works.
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const severity = params.get('severity') || '';
  const status = params.get('status') || '';
  const category = params.get('category') || '';
  const jobId = params.get('jobId') || '';
  const sortBy = params.get('sortBy') || 'createdAt';
  const order = params.get('order') || 'desc';

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const query = { page, limit: LIMIT, sortBy, order };
    if (severity) query.severity = severity;
    if (status) query.status = status;
    if (category) query.category = category;
    if (jobId) query.jobId = jobId;
    listAlerts(query)
      .then((res) => {
        if (!cancelled) setState({ loading: false, error: '', items: res.data, pagination: res.pagination });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: apiErrorMessage(err, 'Could not load alerts.'), items: [], pagination: null });
      });
    return () => {
      cancelled = true;
    };
  }, [page, severity, status, category, jobId, sortBy, order]);

  // Changing any filter goes back to page 1.
  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function resetFilters() {
    setCategoryDraft('');
    setParams(new URLSearchParams());
  }

  const filtered = Boolean(severity || status || category || jobId);
  const { loading, error, items, pagination } = state;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Alerts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Rows the model flagged as suspicious. Alerts are predictions to investigate, not confirmed attacks.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setParam('category', categoryDraft.trim());
        }}
      >
        <div>
          <label htmlFor="f-severity" className="mb-1 block text-xs text-slate-400">Severity</label>
          <select id="f-severity" value={severity} onChange={(e) => setParam('severity', e.target.value)} className={inputClass}>
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs text-slate-400">Status</label>
          <select id="f-status" value={status} onChange={(e) => setParam('status', e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(ALERT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-category" className="mb-1 block text-xs text-slate-400">Category (exact name, press Enter)</label>
          <input id="f-category" value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)} placeholder="e.g. DoS" className={inputClass} />
        </div>
        <div>
          <label htmlFor="f-sort" className="mb-1 block text-xs text-slate-400">Sort by</label>
          <select id="f-sort" value={sortBy} onChange={(e) => setParam('sortBy', e.target.value)} className={inputClass}>
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-order" className="mb-1 block text-xs text-slate-400">Order</label>
          <select id="f-order" value={order} onChange={(e) => setParam('order', e.target.value)} className={inputClass}>
            <option value="desc">Highest / newest first</option>
            <option value="asc">Lowest / oldest first</option>
          </select>
        </div>
        {filtered && (
          <button type="button" onClick={resetFilters} className={secondaryButtonClass}>Clear filters</button>
        )}
      </form>

      {jobId && (
        <p className="text-sm text-slate-400">
          Showing alerts from one analysis. <Link to={`/jobs/${encodeURIComponent(jobId)}`} className="text-emerald-400 underline">Back to its results</Link>
        </p>
      )}

      <ErrorBox message={error} />
      {loading && <Spinner label="Loading alerts..." />}

      {!loading && !error && items.length === 0 && (
        <EmptyState title={filtered ? 'No alerts match these filters' : 'No alerts yet'}>
          {filtered ? 'Try clearing a filter.' : <>Alerts appear after you <Link to="/upload" className="text-emerald-400 underline">upload and analyse a CSV</Link>.</>}
        </EmptyState>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Alerts</caption>
              <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-2">Severity</th>
                  <th scope="col" className="px-3 py-2">Category</th>
                  <th scope="col" className="px-3 py-2">Attack score</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">File (line)</th>
                  <th scope="col" className="px-3 py-2">Created</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-900/60">
                    <td className="px-3 py-2"><SeverityBadge value={a.severity} /></td>
                    <td className="px-3 py-2">{a.attackCategory || <span className="text-slate-500">none</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{formatScore(a.attackScore)}</td>
                    <td className="px-3 py-2"><AlertStatusBadge value={a.status} /></td>
                    <td className="max-w-[14rem] truncate px-3 py-2" title={a.sourceFileName}>{a.sourceFileName} ({a.csvLine})</td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(a.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Link to={`/alerts/${a.id}`} className="text-emerald-400 underline" aria-label={`Open ${a.severity} alert from line ${a.csvLine}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-slate-400">
            <span>
              Page {pagination.page} of {pagination.pages} ({formatCount(pagination.total)} alerts)
            </span>
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
