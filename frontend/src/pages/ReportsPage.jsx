import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listReports } from '../api/client.js';
import { apiErrorMessage, formatCount, formatDate } from '../utils/format.js';
import { EmptyState, ErrorBox, Spinner, inputClass, secondaryButtonClass } from '../components/ui.jsx';

const LIMIT = 20;
export const REPORT_TYPE_LABELS = { detection_summary: 'Detection summary', incident: 'Incident report' };

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '', items: [], pagination: null });

  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const type = params.get('type') || '';

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const query = { page, limit: LIMIT };
    if (type) query.type = type;
    listReports(query)
      .then((res) => !cancelled && setState({ loading: false, error: '', items: res.data, pagination: res.pagination }))
      .catch((err) => !cancelled && setState({ loading: false, error: apiErrorMessage(err, 'Could not load reports.'), items: [], pagination: null }));
    return () => {
      cancelled = true;
    };
  }, [page, type]);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  const { loading, error, items, pagination } = state;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-slate-400">
          Written summaries built from your stored analyses and incidents. Open an analysis or an incident and choose &quot;Generate report&quot;.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="r-type" className="mb-1 block text-xs text-slate-400">Type</label>
          <select id="r-type" value={type} onChange={(e) => setParam('type', e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        {type && <button type="button" onClick={() => setParams(new URLSearchParams())} className={secondaryButtonClass}>Clear filter</button>}
      </div>

      <ErrorBox message={error} />
      {loading && <Spinner label="Loading reports..." />}

      {!loading && !error && items.length === 0 && (
        <EmptyState title={type ? 'No reports of this type' : 'No reports yet'}>
          {type ? 'Try clearing the filter.' : 'Finish an analysis or open an incident, then choose "Generate report".'}
        </EmptyState>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Reports</caption>
              <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-2">Title</th>
                  <th scope="col" className="px-3 py-2">Type</th>
                  <th scope="col" className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/60">
                    <td className="max-w-[28rem] truncate px-3 py-2"><Link to={`/reports/${r.id}`} className="text-emerald-400 underline">{r.title}</Link></td>
                    <td className="px-3 py-2">{REPORT_TYPE_LABELS[r.type] || r.type}</td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-slate-400">
            <span>Page {pagination.page} of {pagination.pages} ({formatCount(pagination.total)} reports)</span>
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
