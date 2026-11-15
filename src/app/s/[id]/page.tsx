'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import type { Msg, Result, SessionState } from '@/lib/types';

type PublicClaim = { id: string; text: string };
type View = {
  id: string; state: SessionState; mode: 'judge' | 'full';
  scenario: { notice: string; timeLimit: number; task: { title: string; prompt: string; requirements: string[] }; pack: { id: string; title: string; body: string }[]; teammateDelay: number | null };
  startedAt: number | null; serverNow: number; messages: Msg[]; claims: PublicClaim[]; teammateShown: boolean; brief: string; followUp: string | null; liveModel: boolean;
};
type Reveal = { mode: string; result: Result; cohort: { nodeId: string; pct: number; n: number }[]; statements: { id: string; text: string; flawed: boolean }[]; brief: string; notice: string };

const post = (url: string, body: unknown = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = `/api/sessions/${id}`;
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(api);
    if (!res.ok) { setError('This session could not be found.'); return; }
    setView(await res.json());
  }, [api]);
  useEffect(() => { load(); }, [load]);

  if (error) return <main className="wrap"><p className="error">{error}</p><a href="/">Start again</a></main>;
  if (!view) return <main className="wrap"><p className="muted">Loading</p></main>;
  if (view.state === 'intro') return <Intro view={view} onStart={async () => { await post(`${api}/start`); load(); }} />;
  if (view.state === 'work') return <Work view={view} api={api} onDone={load} />;
  if (view.state === 'debrief') return <Debrief view={view} api={api} onDone={load} />;
  return <RevealPage api={api} />;
}

function Intro({ view, onStart }: { view: View; onStart: () => void }) {
  const t = view.scenario.task;
  return (
    <main className="wrap">
      <h1>{t.title}</h1>
      <div className="card">
        <p>{t.prompt}</p>
        <ul>{t.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="muted small">{view.scenario.notice}</p>
      </div>
      <p>You have <b>{mmss(view.scenario.timeLimit)}</b>. The clock starts when you press the button.</p>
      <button className="primary" onClick={onStart}>Start</button>
    </main>
  );
}

function Work({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(view.messages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [brief, setBrief] = useState(view.brief);
  const [left, setLeft] = useState(view.scenario.timeLimit);
  const [error, setError] = useState('');
  const [hasClaims, setHasClaims] = useState(view.claims.length > 0);
  const offset = useRef(view.serverNow - Date.now());
  const teammateDone = useRef(view.teammateShown);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = streaming !== null;

  useEffect(() => {
    const tick = () => setLeft(view.scenario.timeLimit - (Date.now() + offset.current - (view.startedAt ?? Date.now())) / 1000);
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [view]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, streaming]);

  // Autosave the brief so the event log has snapshots of how it changed.
  useEffect(() => {
    const t = setTimeout(() => { if (brief !== view.brief) post(`${api}/event`, { type: 'draft', text: brief }); }, 2500);
    return () => clearTimeout(t);
  }, [brief, api, view.brief]);

  // The scripted teammate message arrives a fixed time after the assistant's draft (full version only).
  useEffect(() => {
    if (!hasClaims || teammateDone.current || view.scenario.teammateDelay === null) return;
    const t = setTimeout(async () => {
      const res = await post(`${api}/teammate`);
      const body = await res.json();
      if (body.message) { teammateDone.current = true; setMessages((m) => [...m, body.message]); }
    }, view.scenario.teammateDelay * 1000);
    return () => clearTimeout(t);
  }, [hasClaims, api, view.scenario.teammateDelay]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError('');
    setNotices([]);
    setMessages((m) => [...m, { role: 'user', text, ts: Date.now() }]);
    setStreaming('');
    let reply = '';
    let claims: PublicClaim[] | undefined;
    try {
      const res = await post(`${api}/chat`, { text });
      if (!res.ok || !res.body) throw new Error((await res.json()).error ?? 'Request failed');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const ev = JSON.parse(part.slice(6));
          if (ev.type === 'delta') { reply += ev.text; setStreaming(reply); }
          else if (ev.type === 'claims') claims = ev.claims;
          else if (ev.type === 'guardrail') setNotices((n) => [...n, ev.kind]);
          else if (ev.type === 'error') setError(ev.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant could not reply. Try again.');
    }
    if (reply) setMessages((m) => [...m, { role: 'assistant', text: reply, ts: Date.now(), claims }]);
    if (claims) setHasClaims(true);
    setStreaming(null);
  }

  async function submit() {
    setError('');
    const res = await post(`${api}/submit`, { brief });
    if (!res.ok) { setError((await res.json()).error); return; }
    onDone();
  }

  const words = brief.trim() ? brief.trim().split(/\s+/).length : 0;
  const noticeText: Record<string, string> = {
    pii: 'Names and contact details were removed before your message reached the assistant.',
    injection: 'The assistant cannot discuss how this activity is set up.',
    ghostwrite: 'The assistant will guide you, but it will not write the finished brief.',
  };

  return (
    <div className="work">
      <div className="topbar">
        <b>{view.scenario.task.title}</b>
        <span className="muted small">{left <= 0 ? 'Time is up. Submit your brief now.' : 'Time left'}</span>
        <span className={`timer ${left < 60 ? 'low' : ''}`}>{mmss(Math.max(0, left))}</span>
      </div>
      <div className="cols">
        <section className="col">
          <h2>Source pack</h2>
          <div className="scroll">
            <details open>
              <summary>Your task</summary>
              <div className="body">{view.scenario.task.prompt}{'\n\n'}{view.scenario.task.requirements.map((r) => `• ${r}`).join('\n')}</div>
            </details>
            {view.scenario.pack.map((p) => (
              <details key={p.id} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) post(`${api}/event`, { type: 'pack_open', section: p.id }); }}>
                <summary>{p.title}</summary>
                <div className="body">{p.body}</div>
              </details>
            ))}
          </div>
        </section>

        <section className="col">
          <h2>AI research assistant{view.liveModel ? '' : ' (offline replies)'}</h2>
          <div className="scroll">
            {messages.length === 0 && !busy && <p className="muted">Tell the assistant what you need.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="who">{m.role === 'user' ? 'You' : m.role === 'teammate' ? 'Sam (teammate)' : 'Assistant'}</div>
                <div className="bubble">{m.text}</div>
                {m.claims?.map((c) => (
                  <div key={c.id} className="claim">
                    <span>{c.text}</span>
                    <button className="small" onClick={() => setBrief((b) => (b ? `${b.trimEnd()} ${c.text}` : c.text))}>Insert</button>
                  </div>
                ))}
              </div>
            ))}
            {busy && <div className="msg assistant"><div className="who">Assistant</div><div className="bubble">{streaming || '…'}</div></div>}
            {notices.map((n) => <div key={n}><span className="notice">{noticeText[n]}</span></div>)}
            <div ref={endRef} />
          </div>
          <div className="composer">
            <input type="text" value={input} placeholder="Message the assistant" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="primary" disabled={busy || !input.trim()} onClick={send}>Send</button>
          </div>
        </section>

        <section className="col">
          <h2>Your brief</h2>
          <textarea className="brief" value={brief} placeholder="Write your briefing paragraph here. You can insert statements from the assistant and edit them." onChange={(e) => setBrief(e.target.value)} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span className="muted small">{words} words</span>
            <button className="primary" disabled={words < 20} onClick={submit}>Submit to supervisor</button>
          </div>
          {error && <p className="error small">{error}</p>}
        </section>
      </div>
    </div>
  );
}

function Debrief({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(50);
  const [touched, setTouched] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');

  async function finish() {
    const res = await post(`${api}/debrief`, { flagged, confidence, answer });
    if (!res.ok) { setError((await res.json()).error); return; }
    onDone();
  }

  return (
    <main className="wrap">
      <h1>Your supervisor has three questions</h1>
      {step === 1 ? (
        <>
          <div className="card">
            <h3>1. Which of the assistant&apos;s statements did you decide not to rely on?</h3>
            <p className="muted small">Tick any that apply. Leave all unticked if none.</p>
            {view.claims.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={flagged.includes(c.id)} onChange={(e) => setFlagged((f) => (e.target.checked ? [...f, c.id] : f.filter((x) => x !== c.id)))} />
                <span>{c.text}</span>
              </label>
            ))}
          </div>
          <div className="card">
            <h3>2. How confident are you that everything in your brief is accurate?</h3>
            <input type="range" min={0} max={100} step={5} value={confidence} style={{ width: '100%' }} onChange={(e) => { setConfidence(Number(e.target.value)); setTouched(true); }} />
            <p><b>{confidence}%</b> <span className="muted small">{touched ? '' : 'Move the slider to answer.'}</span></p>
          </div>
          <button className="primary" disabled={!touched} onClick={() => setStep(2)}>Next</button>
        </>
      ) : (
        <>
          <div className="card">
            <h3>3. {view.followUp}</h3>
            <textarea rows={4} value={answer} placeholder="One or two sentences" onChange={(e) => setAnswer(e.target.value)} />
            <p className="muted small">This answer is recorded but not scored.</p>
          </div>
          <button className="primary" onClick={finish}>See what happened</button>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </main>
  );
}

function RevealPage({ api }: { api: string }) {
  const [data, setData] = useState<Reveal | null>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => { fetch(`${api}/result`).then((r) => r.json()).then(setData); }, [api]);
  if (!data) return <main className="wrap"><p className="muted">Loading</p></main>;

  const { result, cohort } = data;
  const h = result.headline;
  // The headline item is revealed first; the rest follow in session order.
  const rest = result.nodes.filter((n) => n.id !== h.nodeId);
  const allShown = shown >= rest.length;
  const label = ['Missed', 'Partly', 'Well handled'];
  const titles = { confident_wrong: 'The moment you were confident, and wrong', unsure_wrong: 'The error that got through', best_call: 'Your best call', none: 'What we saw' };

  return (
    <main className="wrap">
      <h1>What happened in your session</h1>
      <p className="muted">Based on your choices in this session only. It describes what you did here, not what kind of person you are.</p>

      <div className={`card headline ${h.kind}`}>
        <h2>{titles[h.kind]}</h2>
        <div className="step"><b>What happened</b>{h.happened}</div>
        <div className="step"><b>What it shows</b>{h.means}</div>
        <div className="step"><b>What to do next</b>{h.next}</div>
        {cohort.filter((c) => c.nodeId === h.nodeId).map((c) => <p key={c.nodeId} className="muted small">{c.pct}% of {c.n} people today also trusted this.</p>)}
      </div>

      <h2>Everything else, one at a time</h2>
      {rest.map((n, i) =>
        i < shown ? (
          <div key={n.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{n.title}</h3>
              <span className={`pill s${n.score}`}>{label[n.score]}</span>
            </div>
            <p className="muted small">{n.dimension}</p>
            <div className="step"><b>What you did</b>{n.evidence}</div>
            <div className="step"><b>What was going on</b>{n.reveal}</div>
            {cohort.filter((c) => c.nodeId === n.id).map((c) => <p key={c.nodeId} className="muted small">{c.pct}% of {c.n} people today also trusted this.</p>)}
          </div>
        ) : i === shown ? (
          <div key={n.id} className="card flip closed" onClick={() => setShown(shown + 1)}>Tap to reveal: {n.title}</div>
        ) : null,
      )}
      {!allShown && <p><button onClick={() => setShown(rest.length)}>Reveal all</button></p>}

      {allShown && (
        <>
          <div className="card">
            <h2>The assistant&apos;s statements</h2>
            {data.statements.map((s) => (
              <p key={s.id}><span className={`pill ${s.flawed ? 's0' : 's2'}`}>{s.flawed ? 'Wrong' : 'Correct'}</span> {s.text}</p>
            ))}
            <p className="muted small">{data.notice}</p>
          </div>

          <div className="card">
            <h2>Four areas</h2>
            <div className="dims">
              {result.dimensions.map((d) => (
                <div key={d.dimension} className="dim">
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{d.dimension}</b><span className={`pill ${d.band}`}>{d.band}</span></div>
                  <p className="muted small">Based on {d.nodes} moment{d.nodes === 1 ? '' : 's'}{d.capped ? '. Limited because a classmate’s name was shared.' : '.'}</p>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>Thresholds not yet calibrated. Each area rests on a handful of moments, so treat these as prompts for reflection, not grades.</p>
            {result.calibration.overconfidence !== null && (
              <p className="small">You said you were {Math.round(result.calibration.confidence * 100)}% confident. {Math.round(result.calibration.accuracy! * 100)}% of the data points in your brief were sound.</p>
            )}
          </div>

          <div className="card">
            <h2>Three things to try next</h2>
            <ol>{result.suggestions.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
          <a href="/">Start a new session</a>
        </>
      )}
    </main>
  );
}
