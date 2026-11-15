'use client';
import { useEffect, useState } from 'react';

type Stats = { n: number; avg: number; p95: number } | null;
type Ops = { sessions: { state: string; n: number }[]; events: number; guardrails: Record<string, number>; replies: Record<string, number>; modelFirstTokenMs: Stats; modelTotalMs: Stats; errors: string[] };

export default function OpsPage() {
  const [ops, setOps] = useState<Ops | null>(null);
  useEffect(() => {
    const load = () => fetch('/api/ops').then((r) => r.json()).then(setOps).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!ops) return <main className="wrap"><p className="muted">Loading</p></main>;
  const stat = (s: Stats) => (s ? `${s.avg} ms average, ${s.p95} ms p95 (${s.n} replies)` : 'No live model replies yet');
  return (
    <main className="wrap">
      <h1>Operations</h1>
      <p className="muted">Last 24 hours. Refreshes every 5 seconds.</p>
      <div className="card">
        <h2>Guardrail triggers</h2>
        {['pii', 'injection', 'ghostwrite'].map((k) => <p key={k}><b>{ops.guardrails[k] ?? 0}</b> {k === 'pii' ? 'personal data redactions' : k === 'injection' ? 'answer-key extraction attempts blocked' : 'switches to guide-only mode'}</p>)}
      </div>
      <div className="card">
        <h2>Assistant replies</h2>
        <p><b>{ops.replies.scripted}</b> pre-written, <b>{ops.replies.model}</b> live model, <b>{ops.replies.fallback}</b> fallback</p>
        <p>Time to first token: {stat(ops.modelFirstTokenMs)}</p>
        <p>Total response time: {stat(ops.modelTotalMs)}</p>
        {ops.errors.map((e, i) => <p key={i} className="error small">{e}</p>)}
      </div>
      <div className="card">
        <h2>Sessions</h2>
        {ops.sessions.length === 0 && <p className="muted">None yet</p>}
        {ops.sessions.map((s) => <p key={s.state}><b>{s.n}</b> in {s.state}</p>)}
        <p className="muted small">{ops.events} events logged</p>
      </div>
    </main>
  );
}
