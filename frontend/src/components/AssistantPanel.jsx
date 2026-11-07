import { useEffect, useId, useState } from 'react';
import { Bot } from 'lucide-react';
import { askAssistant, askGeneral, getAssistantStatus } from '../api/client.js';
import { apiErrorMessage } from '../utils/format.js';
import { Card, ErrorBox, buttonClass, inputClass } from './ui.jsx';

const QUESTION_MAX = 500;
const GENERAL_QUESTION_MAX = 1000;

// `target` is {} (general question), { alertId } or { incidentId }. The server loads that record itself,
// so only the id is sent from here. Everything the assistant returns is shown as plain text.
// `allowGeneral` (general-question page only) adds a "General chat" mode: any topic, no reference documents, no sources.
export default function AssistantPanel({ target = {}, title = 'Ask the assistant', allowGeneral = false }) {
  const questionId = useId();
  const [status, setStatus] = useState({ loading: true, data: null, error: '' });
  const [question, setQuestion] = useState('');
  const [includeRowValues, setIncludeRowValues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('cited'); // 'cited' | 'general'

  useEffect(() => {
    let cancelled = false;
    getAssistantStatus()
      .then((data) => !cancelled && setStatus({ loading: false, data, error: '' }))
      .catch((err) => !cancelled && setStatus({ loading: false, data: null, error: apiErrorMessage(err, 'Could not check the assistant.') }));
    return () => {
      cancelled = true;
    };
  }, []);

  const canSendRows = Boolean(target.alertId) && Boolean(status.data?.rowValuesAllowed);
  const trimmed = question.trim();
  const offerGeneral = allowGeneral && status.data?.generalChatAllowed === true;
  const general = offerGeneral && mode === 'general';
  const questionMax = general ? GENERAL_QUESTION_MAX : QUESTION_MAX;

  function chooseMode(next) {
    setMode(next);
    setResult(null);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (general) {
        // Only the question is sent: no record ids and no row values can reach the model in this mode.
        setResult(await askGeneral({ question: trimmed }));
      } else {
        const body = { question: trimmed, ...target };
        if (canSendRows && includeRowValues) body.includeRowValues = true;
        setResult(await askAssistant(body));
      }
    } catch (err) {
      setResult(null);
      setError(apiErrorMessage(err, 'The assistant could not answer.'));
    } finally {
      setBusy(false);
    }
  }

  const unreachable = !status.loading && status.data && status.data.reachable === false;
  const noModel = !status.loading && status.data && status.data.reachable && !status.data.llmConfigured;
  const generalBlocked = general && noModel;

  return (
    <Card title={title}>
      <div className="space-y-3">
        {status.error && <ErrorBox message={status.error} />}
        {unreachable && <ErrorBox message="The assistant is unavailable: the AI service is not running." />}
        {noModel && (
          <p className="rounded-md border border-amber-500/40 bg-amber-950/40 p-2 text-sm text-amber-200">
            {general
              ? 'No language model is set up, so General chat cannot answer. Add LLM_API_KEY to the AI service settings.'
              : 'No language model is set up, so you will only get the matching reference passages, not a written answer.'}
          </p>
        )}

        {offerGeneral && (
          <fieldset className="space-y-2 rounded-md border border-slate-700 bg-slate-950 p-3">
            <legend className="px-1 text-sm font-medium text-slate-200">Mode</legend>
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input type="radio" name="assistant-mode" checked={mode === 'cited'} onChange={() => chooseMode('cited')} className="mt-1" />
              <span>Cited answers (from reference documents)</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input type="radio" name="assistant-mode" checked={mode === 'general'} onChange={() => chooseMode('general')} className="mt-1" />
              <span>General chat (any topic, not verified)</span>
            </label>
            {general && (
              <p className="text-xs text-amber-200">
                The model answers from its own knowledge. No reference documents are used, there are no sources, and it can be
                wrong or out of date. Your question is sent to Google, so do not type real company or personal data.
              </p>
            )}
          </fieldset>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor={questionId} className="mb-1 block text-sm font-medium text-slate-200">Your question</label>
            <textarea
              id={questionId}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={questionMax}
              rows={3}
              className={inputClass}
              placeholder={general ? 'Ask anything' : target.alertId ? 'For example: Why might this flow have been flagged, and what should I check next?' : 'Ask about incident handling or attack types'}
            />
            <p className="mt-1 text-xs text-slate-500">{question.length} / {questionMax}</p>
          </div>

          {canSendRows && (
            <div className="rounded-md border border-slate-700 bg-slate-950 p-3">
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={includeRowValues} onChange={(e) => setIncludeRowValues(e.target.checked)} className="mt-1" />
                <span>Also send this flow&apos;s raw row values (addresses, ports and other columns) to the language model</span>
              </label>
              <p className="mt-2 text-xs text-slate-400">
                Off by default. The question and any data you include are sent to Google. On Google&apos;s free tier, its terms say
                the content may be used to improve its products and may be read by human reviewers, and tell you not to submit
                personal or sensitive information. Leave this off for real company traffic.
              </p>
            </div>
          )}

          <ErrorBox message={error} />
          <button type="submit" disabled={busy || trimmed.length < 3 || unreachable || generalBlocked} className={buttonClass}>
            <Bot className="h-4 w-4" aria-hidden="true" /> {busy ? 'Thinking...' : 'Ask'}
          </button>
        </form>

        {result && <AnswerView result={result} />}
      </div>
    </Card>
  );
}

function AnswerView({ result }) {
  const general = result.mode === 'general';
  return (
    <div className="space-y-3 border-t border-slate-800 pt-3" aria-live="polite">
      {result.generated && result.answer ? (
        <div>
          <h3 className="text-sm font-medium text-slate-200">Answer</h3>
          {/* Plain text only: React escapes it. Labels like [S1] refer to the sources listed below. */}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-100">{result.answer}</p>
          <p className="mt-2 text-xs text-slate-500">
            {general
              ? `General answer from an AI model${result.model ? ` (${result.model})` : ''}. Not verified: it has no sources and can be wrong or out of date.`
              : `Written by an AI model${result.model ? ` (${result.model})` : ''}. It can be wrong. It is a suggestion, not a confirmed finding: check the sources and the underlying traffic.`}
            {result.rowValuesSent ? ' Raw row values were included in this question.' : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-300">No written answer was produced.</p>
      )}

      {result.notes?.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {!general && (
      <div>
        <h3 className="text-sm font-medium text-slate-200">Sources</h3>
        {result.sources?.length ? (
          <ol className="mt-2 space-y-2">
            {result.sources.map((s) => (
              <li key={s.id} className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm">
                <p>
                  <span className="font-mono text-xs text-slate-400">{s.id}</span>{' '}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">{s.title}</a>
                  ) : (
                    <span>{s.title}</span>
                  )}
                  <span className="text-slate-400"> &middot; {s.publisher}{s.section ? ` \u00b7 ${s.section}` : ''}</span>
                  {s.cited && <span className="ml-2 rounded bg-emerald-900/50 px-1.5 py-0.5 text-xs text-emerald-200">cited in the answer</span>}
                </p>
                {!s.url && <p className="text-xs text-slate-500">Team notes, not an official source.</p>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-slate-400">Show the passage</summary>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300">{s.snippet}</p>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-slate-400">No reference passage matched this question.</p>
        )}
      </div>
      )}
    </div>
  );
}
