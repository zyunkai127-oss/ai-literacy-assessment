'use client';
import { useState } from 'react';
import type { Decision, Declared } from '@/lib/types';
import { errorOf, post, type View } from './shared';

const CHOICES: { value: Decision; label: string }[] = [
  { value: 'relied', label: 'Relied on it' },
  { value: 'unsure', label: 'Not sure' },
  { value: 'not', label: 'Didn’t rely on it' },
];
const WROTE: { value: Declared; label: string }[] = [
  { value: 'MINE', label: 'Mostly me' },
  { value: 'MIXED', label: 'About half and half' },
  { value: 'AI', label: 'Mostly the assistant' },
];

export function Debrief({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  return view.state === 'viva' ? <Viva view={view} api={api} onDone={onDone} /> : <Questions view={view} api={api} onDone={onDone} />;
}

/** One screen: a decision per statement, overall confidence, and who wrote the wording. */
function Questions({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [confidence, setConfidence] = useState(50);
  const [touched, setTouched] = useState(false);
  const [declared, setDeclared] = useState<Declared | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unsure = Object.values(decisions).filter((d) => d === 'unsure').length;
  const complete = view.claims.every((c) => decisions[c.id]) && touched && declared !== null;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await post(`${api}/debrief`, { decisions, confidence, declared });
      if (!res.ok) throw new Error(await errorOf(res, 'Your answers could not be saved. Try again.'));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your answers could not be saved. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>Your supervisor has a few questions</h1>
      <p className="muted">Brief submitted. This takes about 20 seconds.</p>

      {view.claims.length > 0 && (
        <div className="card">
          <h2>The assistant’s statements</h2>
          <p>For each one, how did you treat it? Choose “Not sure” for at most two.</p>
          {view.claims.map((c) => (
            <fieldset key={c.id} className="decision">
              <legend>{c.text}</legend>
              <div className="row">
                {CHOICES.map((choice) => (
                  <label key={choice.value} className={`choice ${decisions[c.id] === choice.value ? 'on' : ''}`}>
                    <input type="radio" name={`d-${c.id}`} checked={decisions[c.id] === choice.value}
                      disabled={busy || (choice.value === 'unsure' && unsure >= 2 && decisions[c.id] !== 'unsure')}
                      onChange={() => setDecisions((d) => ({ ...d, [c.id]: choice.value }))} />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Overall confidence</h2>
        <label htmlFor="confidence">How confident are you that everything in your brief is accurate?</label>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted small">Not at all</span>
          <input id="confidence" type="range" min={0} max={100} step={5} value={confidence} disabled={busy} style={{ flex: 1 }}
            onChange={(e) => { setConfidence(Number(e.target.value)); setTouched(true); }} />
          <span className="muted small">Certain</span>
        </div>
        <p className="muted small">{touched ? `${confidence} out of 100` : 'Move the slider to answer.'}</p>
      </div>

      <div className="card">
        <h2>The wording</h2>
        <p>Who wrote most of the wording in your brief?</p>
        <div className="row">
          {WROTE.map((choice) => (
            <label key={choice.value} className={`choice ${declared === choice.value ? 'on' : ''}`}>
              <input type="radio" name="declared" checked={declared === choice.value} disabled={busy} onChange={() => setDeclared(choice.value)} />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button className="primary" disabled={!complete || busy} onClick={submit}>{busy ? 'Saving…' : view.mode === 'full' ? 'Continue' : 'See my results'}</button>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  );
}

/** Full version only: one follow-up question chosen from the answers above. */
function Viva({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await post(`${api}/viva`, { answer });
      if (!res.ok) throw new Error(await errorOf(res, 'Your answer could not be saved. Try again.'));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your answer could not be saved. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>One follow-up question</h1>
      <div className="card">
        <p><b>{view.viva?.question ?? 'How did you decide what to keep from the assistant’s summary?'}</b></p>
        <textarea aria-label="Your answer" rows={5} maxLength={1000} disabled={busy} value={answer} placeholder="A sentence or two is enough." onChange={(e) => setAnswer(e.target.value)} />
        <p className="muted small">{answer.length} / 1000 characters</p>
      </div>
      <button className="primary" disabled={busy || !answer.trim()} onClick={submit}>{busy ? 'Saving…' : 'See my results'}</button>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  );
}
