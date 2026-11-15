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
      <p className="muted">A short activity where you complete a small piece of work with an AI assistant. At the end you get feedback on how you worked with it, with evidence from your own session.</p>

      <div className="card">
        <h2>Before you start</h2>
        <p><b>The AI in this activity may sometimes be wrong.</b> That is part of the activity. Everything it got wrong is shown to you at the end, so you leave with no false information.</p>
        <p>All data, names and references in the activity are fictional. There is no overall score and no ranking. The feedback is for you.</p>
        <label className="check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I understand that the AI in this activity may sometimes be wrong.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={store} onChange={(e) => setStore(e.target.checked)} />
          <span>Optional: store my session anonymously so it can be included in today&apos;s group comparison. No name or account is collected. If you leave this unticked, your messages and brief are deleted when you finish.</span>
        </label>
      </div>

      <div className="row">
        <button className="primary" disabled={!understood || busy} onClick={() => begin('judge')}>Quick version (3 minutes)</button>
        <button disabled={!understood || busy} onClick={() => begin('full')}>Full version (8 minutes)</button>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
