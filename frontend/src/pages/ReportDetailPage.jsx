import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, Download } from 'lucide-react';
import { getReport } from '../api/client.js';
import { apiErrorMessage, formatDate } from '../utils/format.js';
import { downloadText, safeFileName } from '../utils/download.js';
import { Card, EmptyState, ErrorBox, Spinner, secondaryButtonClass } from '../components/ui.jsx';
import { REPORT_TYPE_LABELS } from './ReportsPage.jsx';

export default function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [copyState, setCopyState] = useState(''); // '', 'copied' or 'failed'

  useEffect(() => {
    let cancelled = false;
    getReport(id)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) setNotFound(true);
        else setLoadError(apiErrorMessage(err, 'Could not load the report.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report.content);
      setCopyState('copied');
    } catch {
      setCopyState('failed'); // clipboard access can be blocked; downloading still works
    }
  }

  if (notFound) return <EmptyState title="Report not found">It may belong to another user. <Link to="/reports" className="text-emerald-400 underline">Back to reports</Link></EmptyState>;
  if (loadError) return <ErrorBox message={loadError} />;
  if (!report) return <Spinner label="Loading report..." />;

  return (
    <div className="space-y-4">
      <Link to="/reports" className="text-sm text-emerald-400 underline">&larr; All reports</Link>
      <div>
        <h1 className="text-xl font-semibold">{report.title}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {REPORT_TYPE_LABELS[report.type] || report.type} · created {formatDate(report.createdAt)}
          {report.relatedJob && <> · <Link to={`/jobs/${report.relatedJob}`} className="text-emerald-400 underline">source analysis</Link></>}
          {report.relatedIncident && <> · <Link to={`/incidents/${report.relatedIncident}`} className="text-emerald-400 underline">source incident</Link></>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => downloadText(`${safeFileName(report.title)}.md`, report.content)} className={secondaryButtonClass}>
          <Download className="h-4 w-4" aria-hidden="true" /> Download (.md)
        </button>
        <button type="button" onClick={handleCopy} className={secondaryButtonClass}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Copy text
        </button>
        <span role="status" aria-live="polite" className="text-sm text-slate-400">
          {copyState === 'copied' && 'Copied.'}
          {copyState === 'failed' && 'Could not copy. Use Download instead.'}
        </span>
      </div>

      <Card title="Report text">
        {/* Rendered as plain text by React. It is Markdown source, shown as written, never inserted as HTML. */}
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200">{report.content}</pre>
      </Card>
    </div>
  );
}
