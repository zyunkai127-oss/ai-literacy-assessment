'use client';
import { useState } from 'react';

export default function Consent() {
  const [understood, setUnderstood] = useState(false);
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function begin(mode: 'judge' | 'full') {
    setBusy(true);
    setError('');
    const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, understood, store }) });
    const body = await res.json();
    if (!res.ok) { setError(body.error); setBusy(false); return; }
    window.location.href = `/s/${body.id}`;
  }

  return (
    <main className="wrap">
      <h1>AI Literacy Check</h1>
      <p className="muted">A short activity about working with AI. You write a briefing paragraph for a supervisor, with an AI research assistant and a small pack of sources. We look at how you and the assistant work together: what you ask it, what you take from it, what you check, and what you write yourself. At the end you get feedback with evidence from your own session. No overall score, no ranking.</p>

      <div className="card">
        <h2>Before you start</h2>
        <p><b>The AI in this activity may sometimes be wrong.</b> As with any AI assistant, how far to rely on it is up to you. This is not a hunt for mistakes: do the task the way you would do real coursework.</p>
        <p>When live chat is available, your messages go to the AI provider with names and contact details removed.</p>
        <p>All data, names and references are fictional. The feedback uses your chat, source opens, editor snapshots, submitted brief and your answers to a few questions at the end. <b>There is no overall score and no ranking.</b> Where the session does not give enough evidence, the feedback says so.</p>
        <label className="check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I understand that the AI in this activity may sometimes be wrong.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={store} onChange={(e) => setStore(e.target.checked)} />
          <span>Optional: store my session anonymously for reviewing this prototype. No name or account is collected. If you leave this unticked, your messages and brief are deleted from this app when you finish.</span>
        </label>
      </div>

      <div className="row">
        <button className="primary" disabled={!understood || busy} onClick={() => begin('judge')}>Quick version (4 minutes)</button>
        <button disabled={!understood || busy} onClick={() => begin('full')}>Full version (8 minutes)</button>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
