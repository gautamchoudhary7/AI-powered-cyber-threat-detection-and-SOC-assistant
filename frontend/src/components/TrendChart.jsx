import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCount } from '../utils/format.js';
import { secondaryButtonClass } from './ui.jsx';

// Two measures on ONE axis (both are alert counts): all flagged rows, and the high + critical subset.
// Series colours come from index.css; they were validated against this app's dark card colour.
const SERIES = [
  { key: 'total', name: 'All alerts', color: 'var(--series-1)' },
  { key: 'high', name: 'High and critical', color: 'var(--series-2)' },
];

// "2026-10-31" -> "Oct 31". The server groups by UTC day, so the label is read as UTC too.
export function dayLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function HoverTip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-100">{dayLabel(label)} (UTC)</p>
      {SERIES.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        if (!entry) return null;
        return (
          <p key={s.key} className="flex items-center gap-2 text-slate-300">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} aria-hidden="true" />
            {s.name}: <span className="font-medium text-slate-100">{formatCount(entry.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

// A chart and its table twin: every value is reachable without hover or colour.
export default function TrendChart({ series }) {
  const [asTable, setAsTable] = useState(false);
  const hasData = series.some((d) => d.total > 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-sm text-slate-300" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-5" style={{ background: s.color, height: 2 }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAsTable((v) => !v)} className={`${secondaryButtonClass} !px-3 !py-1`} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {!hasData && !asTable && <p className="py-10 text-center text-sm text-slate-400">No alerts in this period.</p>}

      {asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Alerts per day (UTC)</caption>
            <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th scope="col" className="px-2 py-1">Day (UTC)</th>
                <th scope="col" className="px-2 py-1">All alerts</th>
                <th scope="col" className="px-2 py-1">High and critical</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {series.map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="px-2 py-1 font-normal text-slate-300">{d.date}</th>
                  <td className="px-2 py-1 tabular-nums">{formatCount(d.total)}</td>
                  <td className="px-2 py-1 tabular-nums">{formatCount(d.high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        hasData && (
          // The height includes the x-axis labels, so the card never grows a nested scrollbar.
          <div className="h-72 w-full" role="group" aria-label="Line chart of alerts per day. Use the table view for exact values.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dayLabel}
                  tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
                  stroke="var(--chart-axis)"
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} domain={[0, 'auto']} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} stroke="var(--chart-axis)" tickLine={false} width={40} />
                <Tooltip content={<HoverTip />} cursor={{ stroke: 'var(--chart-axis)' }} />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: '#0f172a', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      )}
    </div>
  );
}
