import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { createReport } from '../api/client.js';
import { apiErrorMessage } from '../utils/format.js';
import { ErrorBox, secondaryButtonClass } from './ui.jsx';

// `request` is { type: 'detection_summary', jobId } or { type: 'incident', incidentId }.
// The server builds the report from stored data; nothing typed here becomes report text.
export default function GenerateReportButton({ request, label = 'Generate report' }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setError('');
    setBusy(true);
    try {
      const report = await createReport(request);
      navigate(`/reports/${report.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not generate the report.'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handleClick} disabled={busy} className={secondaryButtonClass}>
        <FileText className="h-4 w-4" aria-hidden="true" /> {busy ? 'Generating...' : label}
      </button>
      <ErrorBox message={error} />
    </div>
  );
}
