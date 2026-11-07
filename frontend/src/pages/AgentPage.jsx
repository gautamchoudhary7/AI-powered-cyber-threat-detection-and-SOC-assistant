import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { approveProposal, getAgentStatus, listAgentProposals, rejectProposal, scanAgent } from '../api/client.js';
import { apiErrorMessage, formatDate } from '../utils/format.js';
import { Card, EmptyState, ErrorBox, Spinner, buttonClass, inputClass, secondaryButtonClass } from '../components/ui.jsx';

const STATUS_LABELS = {
  pending: 'Waiting for your decision', approved: 'Approved', executed: 'Done', failed: 'Failed, nothing changed', rejected: 'Rejected', expired: 'Expired',
};
const STATUS_STYLES = {
  pending: 'border-amber-500/60 bg-amber-950 text-amber-200',
  executed: 'border-emerald-500/60 bg-emerald-950 text-emerald-200',
  failed: 'border-red-500/60 bg-red-950 text-red-200',
  rejected: 'border-slate-600 bg-slate-900 text-slate-300',
  expired: 'border-slate-600 bg-slate-900 text-slate-400',
  approved: 'border-sky-500/60 bg-sky-950 text-sky-200',
};
const SHOWN_LINKS = 5;
const LIMIT = 20;

function EvidenceLinks({ evidence }) {
  const alerts = evidence?.alertIds || [];
  const incidents = evidence?.incidentIds || [];
  if (alerts.length === 0 && incidents.length === 0) return null;
  return (
    <p className="text-xs text-slate-400">
      Based on:{' '}
      {incidents.map((id) => (
        <Link key={id} to={`/incidents/${id}`} className="mr-2 text-emerald-400 underline">incident {id.slice(-6)}</Link>
      ))}
      {alerts.slice(0, SHOWN_LINKS).map((id) => (
        <Link key={id} to={`/alerts/${id}`} className="mr-2 text-emerald-400 underline">alert {id.slice(-6)}</Link>
      ))}
      {alerts.length > SHOWN_LINKS && <span>and {alerts.length - SHOWN_LINKS} more alerts</span>}
    </p>
  );
}

function ProposalCard({ proposal, onChanged, disabled }) {
  const [mode, setMode] = useState('idle'); // idle | confirm | reject
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState(null);
  const pending = proposal.status === 'pending';

  async function handleApprove() {
    setError('');
    setBusy(true);
    try {
      const data = await approveProposal(proposal.id);
      setOutcome(data.result);
      setMode('idle');
      onChanged(data.proposal);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this suggestion.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setError('');
    setBusy(true);
    try {
      onChanged(await rejectProposal(proposal.id, reason.trim()));
      setMode('idle');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not reject this suggestion.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-400">{proposal.actionLabel}</span>
        <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[proposal.status] || ''}`}>
          {STATUS_LABELS[proposal.status] || proposal.status}
        </span>
      </div>
      {/* All text below is plain text rendered by React. */}
      <p className="font-medium text-slate-100">{proposal.summary}</p>
      <p className="text-sm text-slate-300">{proposal.rationale}</p>
      <EvidenceLinks evidence={proposal.evidence} />
      <p className="text-xs text-slate-500">
        Suggested {formatDate(proposal.createdAt)}
        {pending ? `, expires ${formatDate(proposal.expiresAt)}` : ''}
        {proposal.decidedAt ? `, decided ${formatDate(proposal.decidedAt)}` : ''}
      </p>
      {proposal.decisionReason && <p className="text-sm text-slate-300">Reason given: {proposal.decisionReason}</p>}
      {(outcome || proposal.result) && (() => {
        const r = outcome || proposal.result;
        return (
          <p role="status" className={`text-sm ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {r.ok ? 'Done: ' : 'Nothing was changed: '}{r.message}
          </p>
        );
      })()}
      <ErrorBox message={error} />

      {pending && mode === 'idle' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={disabled} onClick={() => setMode('confirm')} className={buttonClass}>Approve</button>
          <button type="button" disabled={disabled} onClick={() => setMode('reject')} className={secondaryButtonClass}>Reject</button>
        </div>
      )}

      {pending && mode === 'confirm' && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-950/30 p-3">
          <p className="text-sm text-amber-100">
            You are about to approve this. It will change data in this app (as you). It is not undone automatically.
            Do you want to go ahead?
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={handleApprove} className={buttonClass}>{busy ? 'Working...' : 'Yes, approve and run it'}</button>
            <button type="button" disabled={busy} onClick={() => setMode('idle')} className={secondaryButtonClass}>Cancel</button>
          </div>
        </div>
      )}

      {pending && mode === 'reject' && (
        <div className="space-y-2 rounded-md border border-slate-700 bg-slate-950 p-3">
          <label htmlFor={`reason-${proposal.id}`} className="block text-sm text-slate-200">Reason (optional)</label>
          <input id={`reason-${proposal.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={handleReject} className={buttonClass}>{busy ? 'Working...' : 'Reject this suggestion'}</button>
            <button type="button" disabled={busy} onClick={() => setMode('idle')} className={secondaryButtonClass}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AgentPage() {
  const [agent, setAgent] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', items: [], pagination: null });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanSummary, setScanSummary] = useState('');

  useEffect(() => {
    getAgentStatus().then(setAgent).catch(() => setAgent(null));
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const query = { page, limit: LIMIT };
    if (statusFilter) query.status = statusFilter;
    listAgentProposals(query)
      .then((res) => !cancelled && setState({ loading: false, error: '', items: res.data, pagination: res.pagination }))
      .catch((err) => !cancelled && setState({ loading: false, error: apiErrorMessage(err, 'Could not load suggestions.'), items: [], pagination: null }));
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter]);

  useEffect(() => load(), [load]);

  async function handleScan() {
    setScanError('');
    setScanSummary('');
    setScanning(true);
    try {
      const r = await scanAgent();
      setScanSummary(
        `${r.created} new suggestion${r.created === 1 ? '' : 's'}, ${r.skippedExisting} already seen before.${r.truncated ? ' There were more than the limit, so some were left out.' : ''}`
      );
      if (statusFilter !== 'pending') setStatusFilter('pending');
      else load();
    } catch (err) {
      setScanError(apiErrorMessage(err, 'The scan failed.'));
    } finally {
      setScanning(false);
    }
  }

  // After a decision, show the updated card in place (or drop it if it no longer matches the filter).
  function handleChanged(updated) {
    setState((s) => ({
      ...s,
      items: s.items.map((p) => (p.id === updated.id ? updated : p)),
    }));
  }

  const off = agent && agent.enabled === false;
  const { loading, error, items, pagination } = state;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Suggested actions</h1>
        <p className="mt-1 text-sm text-slate-400">
          The agent looks at your alerts and incidents and <strong>suggests</strong> next steps. It never does anything on its own:
          every suggestion waits for you to approve or reject it. The suggestions come from a few fixed rules (no AI model decides),
          and it can only do three things: create an incident, change an alert&apos;s status, or change an incident&apos;s status.
          Every decision is recorded in the audit log.
        </p>
      </div>

      {off && <ErrorBox message="The agent is turned off on this server." />}

      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={handleScan} disabled={scanning || off} className={buttonClass}>
          <ScanSearch className="h-4 w-4" aria-hidden="true" /> {scanning ? 'Scanning...' : 'Scan for suggestions'}
        </button>
        <div>
          <label htmlFor="ag-status" className="mb-1 block text-xs text-slate-400">Show</label>
          <select id="ag-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div role="status" aria-live="polite" className="text-sm text-emerald-300">{scanSummary}</div>
      <ErrorBox message={scanError} />
      <ErrorBox message={error} />
      {loading && <Spinner label="Loading suggestions..." />}

      {!loading && !error && items.length === 0 && (
        <EmptyState title={statusFilter === 'pending' ? 'Nothing is waiting for your decision' : 'No suggestions here'}>
          Choose &quot;Scan for suggestions&quot; to check your current alerts and incidents.
        </EmptyState>
      )}

      {!loading && items.length > 0 && (
        <>
          <ul className="space-y-3">
            {items.map((p) => (
              <ProposalCard key={p.id} proposal={p} onChanged={handleChanged} disabled={off} />
            ))}
          </ul>
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-slate-400">
            <span>Page {pagination.page} of {pagination.pages}</span>
            <span className="flex gap-2">
              <button type="button" className={secondaryButtonClass} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button type="button" className={secondaryButtonClass} disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next</button>
            </span>
          </nav>
        </>
      )}
      <Card title="What the rules do">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>Three or more new high or critical alerts of the same predicted category from one file: suggest one incident for them.</li>
          <li>Any other new critical alert: suggest marking it &quot;investigating&quot;.</li>
          <li>An open incident whose linked alerts are all resolved or false positives: suggest marking it &quot;contained&quot;.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">Alert severity comes from the model&apos;s score and may be wrong. Check before you approve.</p>
      </Card>
    </div>
  );
}
