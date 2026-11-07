import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats, getDashboardTrends, listAlerts } from '../api/client.js';
import { apiErrorMessage, formatCount, formatDate, formatScore } from '../utils/format.js';
import { AlertStatusBadge, Card, EmptyState, ErrorBox, SeverityBadge, Spinner, Stat } from '../components/ui.jsx';
import TrendChart from '../components/TrendChart.jsx';

const RANGES = [7, 14, 30, 90];

// One colour for every bar: the categories have no natural order, so colour does not carry value.
function CategoryBars({ items }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">No alerts have been raised yet.</p>;
  const max = Math.max(...items.map((c) => c.count), 1);
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.category}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-slate-200">{c.category}</span>
            <span className="text-slate-400">{formatCount(c.count)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-slate-800" aria-hidden="true">
            <div className="h-full rounded-r-sm" style={{ width: `${Math.max(2, (c.count / max) * 100)}%`, background: 'var(--series-1)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ loading: true, error: '', data: null });
  const [recent, setRecent] = useState({ loading: true, error: '', items: [] });
  const [days, setDays] = useState(14);
  const [trend, setTrend] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    getDashboardStats()
      .then((data) => !cancelled && setStats({ loading: false, error: '', data }))
      .catch((err) => !cancelled && setStats({ loading: false, error: apiErrorMessage(err, 'Could not load the totals.'), data: null }));
    listAlerts({ page: 1, limit: 5, sortBy: 'createdAt', order: 'desc' })
      .then((res) => !cancelled && setRecent({ loading: false, error: '', items: res.data }))
      .catch((err) => !cancelled && setRecent({ loading: false, error: apiErrorMessage(err, 'Could not load recent alerts.'), items: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Keep showing the previous chart (dimmed) while the new range loads, so the page does not jump.
    setTrend((t) => ({ ...t, loading: true, error: '' }));
    getDashboardTrends(days)
      .then((data) => !cancelled && setTrend({ loading: false, error: '', data }))
      .catch((err) => !cancelled && setTrend({ loading: false, error: apiErrorMessage(err, 'Could not load the trend.'), data: null }));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const s = stats.data;
  const nothingYet = s && s.totalAlerts === 0 && s.totalAnalyzedRecords === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Totals cover everything you have analysed (all time). Alerts are model predictions to investigate, not confirmed attacks.
        </p>
      </div>

      <ErrorBox message={stats.error} />
      {stats.loading && <Spinner label="Loading totals..." />}

      {nothingYet && (
        <EmptyState title="Nothing analysed yet">
          <Link to="/upload" className="text-emerald-400 underline">Upload a network-flow CSV</Link> to see results here.
        </EmptyState>
      )}

      {s && !nothingYet && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Records analysed" value={formatCount(s.totalAnalyzedRecords)} hint={`${formatCount(s.completedAnalyses)} completed analyses`} />
            <Stat label="Total alerts" value={formatCount(s.totalAlerts)} />
            <Stat label="High and critical alerts" value={formatCount(s.highSeverityAlerts)} />
            <Stat label="Open incidents" value={formatCount(s.openIncidents)} hint="Not yet closed" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Alerts by predicted category" className="lg:col-span-1">
              <CategoryBars items={s.categoryDistribution} />
            </Card>

            <div className="space-y-2 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-slate-100">Alerts over time</h2>
                <div role="group" aria-label="Time range" className="flex overflow-hidden rounded-md border border-slate-700">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={days === r}
                      onClick={() => setDays(r)}
                      className={`px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-400 ${
                        days === r ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {r} days
                    </button>
                  ))}
                </div>
              </div>
              <Card>
                <ErrorBox message={trend.error} />
                {trend.data ? (
                  <div className={trend.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={trend.loading}>
                    <TrendChart series={trend.data.series} />
                  </div>
                ) : (
                  !trend.error && <Spinner label="Loading trend..." />
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <Card title="Recent alerts">
        <ErrorBox message={recent.error} />
        {recent.loading && <Spinner label="Loading recent alerts..." />}
        {!recent.loading && !recent.error && recent.items.length === 0 && <p className="text-sm text-slate-400">No alerts yet.</p>}
        {recent.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Most recent alerts</caption>
                <tbody className="divide-y divide-slate-800">
                  {recent.items.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-3"><SeverityBadge value={a.severity} /></td>
                      <td className="py-2 pr-3">{a.attackCategory || <span className="text-slate-500">no category</span>}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-400">{formatScore(a.attackScore)}</td>
                      <td className="py-2 pr-3"><AlertStatusBadge value={a.status} /></td>
                      <td className="py-2 pr-3 text-slate-400">{formatDate(a.createdAt)}</td>
                      <td className="py-2"><Link to={`/alerts/${a.id}`} className="text-emerald-400 underline" aria-label={`Open ${a.severity} alert from line ${a.csvLine}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm"><Link to="/alerts" className="text-emerald-400 underline">View all alerts</Link></p>
          </>
        )}
      </Card>
    </div>
  );
}
