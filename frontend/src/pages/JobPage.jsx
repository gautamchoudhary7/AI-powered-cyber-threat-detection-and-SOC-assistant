import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, ShieldAlert } from 'lucide-react';
import { downloadJobReport, getJob } from '../api/client.js';
import { apiErrorMessage, formatBytes, formatCount, formatDate } from '../utils/format.js';
import GenerateReportButton from '../components/GenerateReportButton.jsx';
import { Card, EmptyState, ErrorBox, JobStatusBadge, Spinner, Stat, buttonClass, secondaryButtonClass } from '../components/ui.jsx';

const POLL_MS = 2000;
const RETRY_MS = 4000;
const MAX_FAILURES = 5;
const isRunning = (status) => status === 'queued' || status === 'processing';

export default function JobPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [pollError, setPollError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Ask the server for the job every 2 seconds until it finishes. Stops when you leave the page.
  useEffect(() => {
    let stopped = false;
    let timer;
    let failures = 0;
    async function tick() {
      try {
        const latest = await getJob(id);
        if (stopped) return;
        setJob(latest);
        setPollError('');
        failures = 0;
        if (isRunning(latest.status)) timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        if (stopped) return;
        if (err?.response?.status === 404) {
          setNotFound(true);
          return;
        }
        failures += 1;
        setPollError(apiErrorMessage(err, 'Could not load the job.'));
        if (failures < MAX_FAILURES) timer = setTimeout(tick, RETRY_MS);
      }
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  async function handleDownload() {
    setDownloadError('');
    setDownloading(true);
    try {
      await downloadJobReport(id);
    } catch (err) {
      setDownloadError('The report could not be downloaded. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  if (notFound) {
    return (
      <EmptyState title="Job not found">
        It may belong to another user. <Link to="/upload" className="text-emerald-400 underline">Upload a file</Link>
      </EmptyState>
    );
  }
  if (!job) return pollError ? <ErrorBox message={pollError} /> : <Spinner label="Loading job..." />;

  const total = job.totalRows ?? 0;
  const flaggedShare = total > 0 ? Math.round((job.attackCount / total) * 1000) / 10 : 0;
  const categories = [...(job.categoryCounts || [])].sort((a, b) => b.count - a.count);
  const maxCategory = categories.length ? categories[0].count : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Analysis of {job.fileName}</h1>
        <JobStatusBadge value={job.status} />
      </div>
      <p className="text-sm text-slate-400">
        {formatBytes(job.sizeBytes)} uploaded {formatDate(job.createdAt)}
        {job.modelVersion ? ` · model ${job.modelVersion}` : ''}
      </p>

      {pollError && <ErrorBox message={`${pollError} Retrying...`} />}

      {isRunning(job.status) && (
        <Card>
          <div role="status" aria-live="polite" className="space-y-2">
            <p className="font-medium">{job.status === 'queued' ? 'Waiting to start...' : 'Analysing the file...'}</p>
            <p className="text-sm text-slate-400">{formatCount(job.processedRows)} rows processed so far. This page updates by itself.</p>
            <div className="h-2 overflow-hidden rounded bg-slate-800" aria-hidden="true">
              <div className="h-full w-1/3 animate-pulse bg-sky-500" />
            </div>
          </div>
        </Card>
      )}

      {job.status === 'failed' && (
        <ErrorBox message={job.errorMessage || 'The analysis failed.'} />
      )}

      {job.status === 'completed' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Rows analysed" value={formatCount(job.totalRows)} />
            <Stat label="Flagged by the model" value={formatCount(job.attackCount)} hint={`${flaggedShare}% of rows`} />
            <Stat label="Not flagged" value={formatCount(job.normalCount)} />
          </div>

          <Card title="Flagged rows by predicted attack category">
            {categories.length === 0 ? (
              <p className="text-sm text-slate-400">
                {job.attackCount === 0 ? 'The model flagged nothing in this file.' : 'No category information is available (no category model is installed).'}
              </p>
            ) : (
              <ul className="space-y-2">
                {categories.map((c) => (
                  <li key={c.category}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{c.category}</span>
                      <span className="text-slate-400">{formatCount(c.count)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-slate-800" aria-hidden="true">
                      <div className="h-full rounded-r-sm" style={{ width: `${Math.max(2, (c.count / maxCategory) * 100)}%`, background: 'var(--series-1)' }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {job.warnings.length > 0 && (
            <Card title="Notes from the analysis">
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">
                {job.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Link to={`/alerts?jobId=${encodeURIComponent(job.id)}`} className={buttonClass}>
              <ShieldAlert className="h-4 w-4" aria-hidden="true" /> View {formatCount(job.attackCount)} alerts
            </Link>
            <button type="button" onClick={handleDownload} disabled={downloading} className={secondaryButtonClass}>
              <Download className="h-4 w-4" aria-hidden="true" /> {downloading ? 'Preparing...' : 'Download report (CSV)'}
            </button>
            <GenerateReportButton request={{ type: 'detection_summary', jobId: job.id }} label="Generate summary report" />
          </div>
          <ErrorBox message={downloadError} />
          <p className="text-xs text-slate-500">
            These are model predictions, not confirmed attacks. The report lists flagged rows only.
          </p>
        </>
      )}

      {(job.status === 'failed' || job.status === 'completed') && (
        <Link to="/upload" className="text-sm text-emerald-400 underline">
          Upload another file
        </Link>
      )}
    </div>
  );
}
