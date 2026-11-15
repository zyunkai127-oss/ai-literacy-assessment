'use client';
import { useState } from 'react';
import { errorOf, mmss, post, type View } from './shared';

// The source pack is not shown here: it opens only once the clock is running.
export function Intro({ view, api, onStart }: { view: View; api: string; onStart: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { task, timeLimit, notice } = view.scenario;

  async function start() {
    setBusy(true);
    setError('');
    try {
      const res = await post(`${api}/start`);
      if (!res.ok) throw new Error(await errorOf(res, 'Unable to start the assessment.'));
      onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start the assessment.');
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>{task.title}</h1>
      <div className="card">
        <h2>Project Introduction</h2>
        <p>{task.prompt}</p>
        <p className="muted small">{notice}</p>
      </div>
      <div className="card">
        <h2>Project Requirements</h2>
        <ul>{task.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
      </div>
      <div className="card">
        <h2>Expected Deliverables</h2>
        <p>One 80–150-word briefing paragraph for your supervisor and the teaching committee.</p>
        <p className="muted small">After you submit, your supervisor has a few quick questions about how you worked.</p>
      </div>
      <section className="card">
        <h2>Start Assessment</h2>
        <p>You have <b>{mmss(timeLimit)}</b>. The clock starts when you begin, and the source pack opens then.</p>
        <button className="primary" disabled={busy} onClick={start}>Start assessment</button>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
  );
}
