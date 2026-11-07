import AssistantPanel from '../components/AssistantPanel.jsx';

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Assistant</h1>
        <p className="mt-1 text-sm text-slate-400">
          <strong>Cited answers</strong> use only the reference documents in the knowledge base and say so when those documents
          do not cover the question. <strong>General chat</strong> lets you ask about anything, but its answers have no sources
          and are not verified. To ask about a specific alert or incident, open it and use the assistant on its page.
        </p>
      </div>
      <AssistantPanel title="Ask a general question" allowGeneral />
    </div>
  );
}
