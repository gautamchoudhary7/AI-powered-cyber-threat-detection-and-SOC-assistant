import { useEffect, useState } from 'react';
import { getBackendHealth, getMlHealth } from '../api/client.js';

function StatusCard({ title, state }) {
  const { loading, error, lines } = state;
  let badge = 'Checking...';
  let color = 'text-slate-400';
  if (!loading && error) {
    badge = 'Unreachable';
    color = 'text-red-400';
  } else if (!loading) {
    badge = 'Online';
    color = 'text-emerald-400';
  }
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4" aria-label={title}>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        <span className={`text-sm font-semibold ${color}`}>{badge}</span>
      </div>
      {!loading && error && <p className="mt-2 text-sm text-slate-400">{error}</p>}
      {!loading && !error && (
        <ul className="mt-2 space-y-1 text-sm text-slate-400">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const initial = { loading: true, error: null, lines: [] };

export default function StatusPage() {
  const [backend, setBackend] = useState(initial);
  const [ml, setMl] = useState(initial);

  useEffect(() => {
    getBackendHealth()
      .then((d) => setBackend({ loading: false, error: null, lines: [`Status: ${d.status}`] }))
      .catch(() =>
        setBackend({ loading: false, error: 'Could not reach the backend. Is it running on port 5000?', lines: [] })
      );

    getMlHealth()
      .then((d) => {
        if (!d.reachable) {
          setMl({ loading: false, error: 'The backend cannot reach the ML service.', lines: [] });
        } else {
          setMl({
            loading: false,
            error: null,
            lines: [`Status: ${d.status}`, `Detection: ${d.detection}`],
          });
        }
      })
      .catch(() => setMl({ loading: false, error: 'Could not check ML service status.', lines: [] }));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">System status</h2>
      <p className="text-sm text-slate-400">
        Checks whether the backend and the ML service are reachable. Detection works only when the ML service
        reports that a trained model is loaded.
      </p>
      <StatusCard title="Backend API" state={backend} />
      <StatusCard title="ML service" state={ml} />
    </div>
  );
}
