'use client';
import { TeacherReview } from './TeacherReview';
import { useEffect, useState } from 'react';

type Stats = { n: number; avg: number; p95: number } | null;
type Ops = {
  adaptive: { calls: number; unavailable: number; verificationRejects: number; humanDecisions: number; latency: Stats; tokens: number; benchmarkRuns: number; benchmarkMatched: number; benchmarkUnavailable: number };
  sessions: { state: string; n: number }[]; events: number;
  guardrails: Record<string, number>; guardrailActions: Record<string, string>;
  budgetBlocks: number; offer: { shown: number; accepted: number; declined: number }; claimQueries: number;
  replies: Record<string, number>; modelFirstTokenMs: Stats; modelTotalMs: Stats; errors: string[];
};
const LABEL: Record<string, string> = { pii: 'personal data redactions', injection: 'requests for internal instructions or the answer key', ghostwrite: 'requests for finished work' };

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
      <TeacherReview />
      {ops.adaptive && <div className="card"><h2>Adaptive system telemetry</h2>
        <p>{ops.adaptive.calls} agent calls · {ops.adaptive.unavailable} unavailable · {ops.adaptive.verificationRejects} verifier rejections · {ops.adaptive.humanDecisions} human decisions</p>
        <p>{ops.adaptive.tokens} tokens · {stat(ops.adaptive.latency)}</p>
        <p>Benchmark: {ops.adaptive.benchmarkMatched} matches in {ops.adaptive.benchmarkRuns} attempts · {ops.adaptive.benchmarkUnavailable} unavailable</p>
        <p className="muted small">Benchmark labels are provisional. These measure system behaviour, not student ability.</p>
      </div>}
      <p className="muted">Last 24 hours. Refreshes every 5 seconds.</p>
      <div className="card">
        <h2>Guardrails (active)</h2>
        {Object.keys(LABEL).map((k) => (
          <p key={k}><b>{ops.guardrails[k] ?? 0}</b> {LABEL[k]}<br /><span className="muted small">Action: {ops.guardrailActions[k]}</span></p>
        ))}
      </div>
      <div className="card">
        <h2>Controlled moments</h2>
        <p><b>{ops.budgetBlocks}</b> source opens blocked by the reading budget</p>
        <p>Offer to write the final paragraph: <b>{ops.offer.shown}</b> shown, <b>{ops.offer.accepted}</b> accepted, <b>{ops.offer.declined}</b> declined</p>
        <p><b>{ops.claimQueries}</b> times a student questioned a statement and the assistant stood by it</p>
      </div>
      <div className="card">
        <h2>Assistant replies</h2>
        <p><b>{ops.replies.scripted}</b> pre-written, <b>{ops.replies.model}</b> live model, <b>{ops.replies.failed}</b> failed</p>
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
