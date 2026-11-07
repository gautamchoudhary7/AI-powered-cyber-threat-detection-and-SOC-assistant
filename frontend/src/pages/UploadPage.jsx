import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, FileText, Upload, XCircle } from 'lucide-react';
import { uploadCsv } from '../api/client.js';
import { MAX_UPLOAD_MB, apiErrorMessage, formatBytes, validateCsvFile } from '../utils/format.js';
import { Card, ErrorBox, buttonClass, secondaryButtonClass } from '../components/ui.jsx';

export default function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState({ message: '', details: null });

  function choose(selected) {
    setError({ message: '', details: null });
    setProgress(0);
    setFile(selected || null);
    setValidation(selected ? validateCsvFile(selected) : null);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      choose(null);
      setError({ message: 'Please drop one file at a time.', details: null });
      return;
    }
    choose(files[0]);
  }

  function clear() {
    choose(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || !validation?.ok || uploading) return;
    setError({ message: '', details: null });
    setUploading(true);
    setProgress(0);
    try {
      const data = await uploadCsv(file, setProgress);
      navigate(`/jobs/${data.job.id}`);
    } catch (err) {
      setError({ message: apiErrorMessage(err, 'The upload failed.'), details: err?.response?.data?.error?.details });
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Upload network-flow CSV</h1>
        <p className="mt-1 text-sm text-slate-400">
          The CSV needs the same columns the detection model was trained on. Extra columns are ignored. The server checks the
          file again, so a file that passes here can still be rejected.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label
          htmlFor="csv-file"
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center focus-within:ring-2 focus-within:ring-emerald-400 ${
            dragging ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-700 hover:border-slate-500'
          }`}
        >
          <Upload className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <span className="font-medium">Drag a CSV file here, or click to choose one</span>
          <span className="text-xs text-slate-500">.csv only, up to {MAX_UPLOAD_MB} MB</span>
          <input
            ref={inputRef}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>

        {file && (
          <Card>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="text-sm text-slate-400">{formatBytes(file.size)}</p>
                {validation?.ok ? (
                  <p className="mt-1 flex items-center gap-1 text-sm text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Looks fine so far
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm text-red-300">
                    {validation?.errors.map((message) => (
                      <li key={message} className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" onClick={clear} disabled={uploading} className={secondaryButtonClass}>
                Remove
              </button>
            </div>
          </Card>
        )}

        {uploading && (
          <div role="status" aria-live="polite">
            <div className="mb-1 flex justify-between text-sm text-slate-300">
              <span>{progress < 100 ? 'Uploading...' : 'Checking the file...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-800" aria-hidden="true">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <ErrorBox message={error.message} details={error.details} />

        <button type="submit" disabled={!file || !validation?.ok || uploading} className={buttonClass}>
          <Upload className="h-4 w-4" aria-hidden="true" /> {uploading ? 'Working...' : 'Upload and analyse'}
        </button>
      </form>
    </div>
  );
}
