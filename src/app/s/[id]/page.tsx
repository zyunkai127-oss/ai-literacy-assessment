'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { wordCount } from '@/lib/scoring';
import type { Dimension, Msg, Result, ScoreTotal, SessionState } from '@/lib/types';

type View = {
  id: string; state: SessionState; mode: 'judge' | 'full';
  scenario: { notice: string; timeLimit: number; task: { title: string; prompt: string; requirements: string[] }; pack: { id: string; title: string; body: string }[] };
  startedAt: number | null; serverNow: number; messages: Msg[]; brief: string; liveModel: boolean;
};
type Reveal = Result & {
  overall: ScoreTotal;
  dimensions: (ScoreTotal & { dimension: Dimension })[];
  cohort: { nodeId: string; pct: number; n: number }[];
  legacy: boolean;
};

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
  if (view.state === 'intro') return <Intro view={view} api={api} onStart={load} />;
  if (view.state === 'work') return <Work view={view} api={api} onDone={load} />;
  if (view.state === 'debrief') return <PendingSubmission api={api} onDone={load} />;
  return <RevealPage api={api} />;
}

function Resources({ pack, onOpen }: { pack: View['scenario']['pack']; onOpen?: (section: string) => void }) {
  return (
    <details>
      <summary>Additional Resources</summary>
      <div className="body">
        <p>Open the source pack as needed. It is available while you work.</p>
        {pack.map((item) => (
          <details key={item.id} onToggle={(event) => { if (event.currentTarget.open) onOpen?.(item.id); }}>
            <summary>{item.title}</summary>
            <div className="body">{item.body}</div>
          </details>
        ))}
      </div>
    </details>
  );
}

function Intro({ view, api, onStart }: { view: View; api: string; onStart: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { task, pack, timeLimit, notice } = view.scenario;

  async function start() {
    setBusy(true);
    setError('');
    try {
      const res = await post(`${api}/start`);
      if (!res.ok) throw new Error((await res.json()).error);
      onStart();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to start the assessment.');
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
      </div>
      <Resources pack={pack} />
      <section className="card">
        <h2>Start Assessment</h2>
        <p>You have <b>{mmss(timeLimit)}</b>. The clock starts when you begin.</p>
        <button className="primary" disabled={busy} onClick={start}>Start assessment</button>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
  );
}

function Work({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(view.messages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [chatError, setChatError] = useState('');
  const [notices, setNotices] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [brief, setBrief] = useState(view.brief);
  const [left, setLeft] = useState(view.scenario.timeLimit);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const events = useRef(Promise.resolve());
  const savedBrief = useRef(view.brief);
  const offset = useRef(view.serverNow - Date.now());
  const endRef = useRef<HTMLDivElement>(null);
  const busy = streaming !== null;

  useEffect(() => {
    const tick = () => setLeft(view.scenario.timeLimit - (Date.now() + offset.current - (view.startedAt ?? Date.now())) / 1000);
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [view]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, streaming]);

  const record = useCallback((body: unknown, onSaved?: () => void) => {
    events.current = events.current.then(async () => {
      const res = await post(`${api}/event`, body);
      if (!res.ok) throw new Error('An activity update could not be saved.');
      onSaved?.();
    }).catch(() => setError('An activity update could not be saved.'));
  }, [api]);

  // Sample drafts while working. Submission always sends the final text directly.
  useEffect(() => {
    if (submitting) return;
    const t = setTimeout(() => {
      if (brief !== savedBrief.current) record({ type: 'draft', text: brief }, () => { savedBrief.current = brief; });
    }, 2500);
    return () => clearTimeout(t);
  }, [brief, record, submitting]);

  async function send() {
    const text = input.trim();
    if (!text || busy || submitting || !view.liveModel) return;
    setInput('');
    setChatError('');
    setNotices([]);
    setMessages((m) => [...m, { role: 'user', text, ts: Date.now() }]);
    setStreaming('');
    let reply = '';
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
          else if (ev.type === 'guardrail') setNotices((n) => [...n, ev.kind]);
          else if (ev.type === 'error') setChatError(ev.message);
        }
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'The assistant could not reply. Try again.');
    }
    if (reply) setMessages((m) => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
    setStreaming(null);
  }

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await events.current;
      const res = await post(`${api}/submit`, { brief });
      if (!res.ok) throw new Error((await res.json()).error);
      onDone();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Submission failed. Try again.');
      setSubmitting(false);
    }
  }

  const words = wordCount(brief);
  const noticeText: Record<string, string> = {
    pii: 'Names and contact details were removed before your message reached the assistant.',
  };

  return (
    <div className="work">
      <div className="topbar">
        <b>{view.scenario.task.title}</b>
        <span className="muted small">{left <= 0 ? 'Time is up. Submit your brief now.' : 'Time left'}</span>
        <span className={`timer ${left < 60 ? 'low' : ''}`}>{mmss(Math.max(0, left))}</span>
      </div>
      <div className="cols">
        <section className="col references" aria-label="Project references">
          <div className="scroll">
            <details>
              <summary>Project requirements</summary>
              <div className="body">{view.scenario.task.prompt}{'\n\n'}{view.scenario.task.requirements.map((r) => `• ${r}`).join('\n')}</div>
            </details>
            <Resources pack={view.scenario.pack} onOpen={(section) => record({ type: 'pack_open', section })} />
          </div>
        </section>

        <section className="col">
          <h2>AI Chat</h2>
          <div className="scroll">
            {!view.liveModel && <p role="status" className="muted">Live AI chat is unavailable. You can continue with the source pack and Brief editor.</p>}
            {view.liveModel && messages.length === 0 && !busy && <p className="muted">Ask about the source pack or get help structuring your brief.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="who">{m.role === 'user' ? 'You' : m.role === 'teammate' ? 'Sam (teammate)' : 'Assistant'}</div>
                <div className="bubble">{m.text}</div>
                {m.claims?.map((c) => (
                  <div key={c.id} className="claim">
                    <span>{c.text}</span>
                    <button className="small" disabled={submitting || brief.length + c.text.length + 1 > 6000} onClick={() => setBrief((b) => (b ? `${b.trimEnd()} ${c.text}` : c.text))}>Insert</button>
                  </div>
                ))}
              </div>
            ))}
            {busy && <div className="msg assistant"><div className="who">Assistant</div><div className="bubble">{streaming || '…'}</div></div>}
            {notices.map((n) => <div key={n}><span className="notice">{noticeText[n]}</span></div>)}
            <div ref={endRef} />
          </div>
          {chatError && <p role="alert" className="error small">{chatError}</p>}
          <div className="composer">
            <input aria-label="Message the assistant" maxLength={4000} disabled={submitting || !view.liveModel} type="text" value={input} placeholder="Message the assistant" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="primary" disabled={busy || submitting || !view.liveModel || !input.trim()} onClick={send}>Send</button>
          </div>
        </section>

        <section className="col">
          <h2>Brief editor</h2>
          <textarea aria-label="Brief" className="brief" maxLength={6000} disabled={submitting} value={brief} placeholder="Write your briefing paragraph here." onChange={(e) => setBrief(e.target.value)} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span className="muted small">{words} words · 80–150 required</span>
            <button className="primary" disabled={!words || busy || submitting} onClick={submit}>{submitting ? 'Submitting…' : 'Submit brief'}</button>
          </div>
          {error && <p role="alert" className="error small">{error}</p>}
        </section>
      </div>
    </div>
  );
}

function PendingSubmission({ api, onDone }: { api: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finish() {
    setBusy(true);
    setError('');
    try {
      const res = await post(`${api}/submit`);
      if (!res.ok) throw new Error((await res.json()).error);
      onDone();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load your results.');
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>Brief submitted</h1>
      <button className="primary" disabled={busy} onClick={finish}>View results</button>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  );
}

const percentage = (score: ScoreTotal) => score.percentage === null ? 'Insufficient Evidence' : `${score.percentage}%`;

function RevealPage({ api }: { api: string }) {
  const [data, setData] = useState<Reveal | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`${api}/result`).then(async (res) => {
      if (!res.ok) throw new Error((await res.json()).error);
      setData(await res.json());
    }).catch(() => setError('Unable to load your results. Refresh to try again.'));
  }, [api]);
  if (error) return <main className="wrap"><p role="alert" className="error">{error}</p></main>;
  if (!data) return <main className="wrap"><p className="muted">Loading results</p></main>;

  return (
    <main className="wrap">
      <section className="card">
        <h1>Overall AI Literacy Score</h1>
        <p className="overall-score">{percentage(data.overall)}</p>
        <p>{data.overall.earned} of {data.overall.possible} available points earned</p>
        <p className="muted small">{data.legacy
          ? 'This session was scored under the previous rubric. The percentage uses its original recorded points.'
          : 'The percentage is points earned divided by points available across scored criteria. Items with insufficient evidence are excluded. This is a prototype score for this session.'}</p>
      </section>

      <section className="card">
        <h2>Competency Breakdown</h2>
        <div className="dims">
          {data.dimensions.map((dimension) => (
            <div key={dimension.dimension} className="dim">
              <h3>{dimension.dimension}</h3>
              <b>{percentage(dimension)}</b>
              {dimension.possible > 0 && <p className="muted small">{dimension.earned} / {dimension.possible} points</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Detailed Points Earned / Lost</h2>
        <p className="muted small">{data.nodes.some((node) => node.flawed && node.statement)
          ? 'Corrections appear alongside the controlled statements shown during your session.'
          : 'No controlled assistant error was shown during this session.'}</p>
        {data.nodes.map((node) => (
          <details key={node.id} open={(node.flawed && !!node.statement) || undefined}>
            <summary>
              {node.title}{' '}
              <span className={node.score === null ? 'muted small' : `pill s${node.score}`}>
                {node.score === null ? 'Insufficient Evidence' : `${node.score} earned · ${2 - node.score} lost`}
              </span>
            </summary>
            <div className="body">
              <p className="muted small">{node.dimension}</p>
              {node.criterion && <p><b>Scoring criterion</b><br />{node.criterion}</p>}
              <p><b>Session evidence</b><br />{node.evidence}</p>
              {node.statement && <p><b>Assistant’s scripted statement</b><br />{node.statement}</p>}
              {node.reveal && <p>{node.reveal}</p>}
              {data.cohort.filter((peer) => peer.nodeId === node.id).map((peer) => (
                <p key={peer.nodeId} className="muted small">{peer.pct}% of {peer.n} stored sessions shown this claim included this error.</p>
              ))}
            </div>
          </details>
        ))}
      </section>

      <section className="card">
        <h2>Personalised Feedback</h2>
        {data.suggestions.length > 0 && <ul>{data.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>}
      </section>
      <a href="/">Start a new session</a>
    </main>
  );
}
