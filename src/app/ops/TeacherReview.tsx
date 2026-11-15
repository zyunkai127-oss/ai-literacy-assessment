'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AdaptiveTurn, AgentTrace } from '@/lib/types';

type Review = { id: string; brief: string; reason: string; trace: AgentTrace[];
  turns: (AdaptiveTurn & { question: string; criterion: string })[];
  choices: { id: string; text: string; support: string }[] };
export function TeacherReview() {
  const [authorized, setAuthorized] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [benchmark, setBenchmark] = useState({ busy: false, done: 0, total: 0, matches: 0, unavailable: 0 });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sources, setSources] = useState<{ title: string; body: string }[]>([]);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/reviews', { cache: 'no-store' });
      if (!res.ok) { setAuthorized(false); return; }
      const data = await res.json(); setAuthorized(true); setReviews(data.reviews); setSources(data.sources);
    } catch { setError('Reviews could not be loaded.'); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      const res = await fetch('/api/ops/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      if (!res.ok) { setError((await res.json()).error); return; }
      setKey(''); await load();
    } catch { setError('Review access could not be established.'); }
  }
  async function runBenchmark() {
    setBenchmark({ busy: true, done: 0, total: 36, matches: 0, unavailable: 0 });
    try {
      const res = await fetch('/api/ops/evaluation');
      if (!res.ok) throw new Error('Could not load benchmark cases.');
      const { fixtures } = await res.json();
      let unavailableInARow = 0;
      for (const f of fixtures as { id: string }[]) {
        let result;
        try {
          const r = await fetch('/api/ops/evaluation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: f.id }), signal: AbortSignal.timeout(45_000) });
          result = r.ok ? await r.json() : { unavailable: true };
        } catch { result = { unavailable: true }; }
        setBenchmark(b => ({ ...b, done: b.done + 1, matches: b.matches + (result.matched && result.verified ? 1 : 0), unavailable: b.unavailable + (result.unavailable ? 1 : 0) }));
        unavailableInARow = result.unavailable ? unavailableInARow + 1 : 0;
        if (unavailableInARow >= 2) { setError('Benchmark paused after two unavailable calls. Remaining cases have not been run.'); break; }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Benchmark failed.'); }
    finally { setBenchmark(b => ({ ...b, busy: false })); }
  }
  return <section>
    <h2>Teacher review</h2>
    {!authorized ? <form className="card" onSubmit={signIn}><label>Review key<input aria-label="Review key" type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="current-password" /></label><button disabled={!key.trim()} type="submit">Open reviews</button></form> : <>
      <div className="card"><h3>Synthetic system evaluation</h3><p>12 scenarios × 3 wordings. Expected labels are provisional and require expert validation.</p><button disabled={benchmark.busy} onClick={runBenchmark}>{benchmark.busy ? 'Running benchmark…' : 'Run 36-case benchmark'}</button>{benchmark.total > 0 && <p role="status">{benchmark.done} / {benchmark.total} completed · {benchmark.matches} verified matches · {benchmark.unavailable} unavailable</p>}</div>
      <p className="muted">{reviews.length} sessions awaiting a human decision. Core feedback is preserved.</p>
      <details className="card"><summary>Source pack for verification</summary>{sources.map(s => <section key={s.title}><h3>{s.title}</h3><p className="body">{s.body}</p></section>)}</details>
      {reviews.map(r => <ReviewCard key={`${r.id}:${r.turns.length}`} review={r} onDone={load} />)}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
function ReviewCard({ review, onDone }: { review: Review; onDone: () => void }) {
  const [next, setNext] = useState('finish');
  const [outcome, setOutcome] = useState('unclear');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function apply() {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/ops/reviews/${review.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: review.turns.length, action: next === 'finish' ? 'finish' : 'ask', questionId: next === 'finish' ? '' : next, outcome }) });
      if (!res.ok) throw new Error((await res.json()).error);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Review could not be saved.'); setBusy(false); }
  }
  return <div className="card">
    <h3>Session {review.id.slice(0, 8)}</h3><p>{review.reason}</p>
    <details><summary>Submitted core brief</summary><p>{review.brief}</p></details>
    {review.turns.map(t => <section className="decision" key={t.id}>
      <p><b>Question {t.id}</b> · {t.support} support</p><p>{t.question}</p><p><b>Criterion:</b> {t.criterion}</p>
      <p><b>Answer:</b> {t.answer ?? 'Not answered'}</p>
      <p><b>Observer:</b> {t.observation?.outcome ?? 'No judgement'} · {t.observation?.signal}</p>
      <p><b>Evidence:</b> {t.observation?.evidence || 'No quoted evidence'}</p>
    </section>)}
    <details><summary>Agent checkpoints and verification</summary>{review.trace.map((t, i) => <p className="small" key={i}>{t.role} · {t.event} · round {t.round} · {t.ms} ms · {t.inputTokens + t.outputTokens} tokens</p>)}</details>
    <label>Latest answer judgement<select aria-label={`Judgement ${review.id}`} disabled={busy} value={outcome} onChange={e => setOutcome(e.target.value)}><option value="unclear">Not enough clear evidence</option><option value="met">Criterion demonstrated</option><option value="not_met">Criterion not yet demonstrated</option></select></label>
    <label>Next step<select aria-label={`Next step ${review.id}`} disabled={busy} value={next} onChange={e => setNext(e.target.value)}><option value="finish">Finish with reviewed feedback</option>{review.choices.map(q => <option key={q.id} value={q.id}>{q.support} · {q.text}</option>)}</select></label>
    <button className="primary" disabled={busy} onClick={apply}>{busy ? 'Applying review…' : 'Apply review and continue'}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
