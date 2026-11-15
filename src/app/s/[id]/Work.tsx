'use client';
import { Restart } from './Restart';
import { useCallback, useEffect, useRef, useState } from 'react';
import { countWords, errorOf, mmss, post, type PublicMsg, type View } from './shared';

const NOTICE: Record<string, string> = {
  pii: 'Names and contact details were removed before your message reached the assistant.',
  injection: 'That message was not sent to the assistant. It cannot discuss how this activity is set up.',
  ghostwrite: 'The final paragraph has to be in your own words, so the assistant will now guide rather than write.',
};

/** Source text with simple tables: consecutive lines containing " | " become a table whose first row is the header. */
function PackBody({ text }: { text: string }) {
  const blocks: { table: boolean; lines: string[] }[] = [];
  for (const line of text.split('\n')) {
    const table = line.includes(' | ');
    const last = blocks[blocks.length - 1];
    if (last && last.table === table) last.lines.push(line);
    else blocks.push({ table, lines: [line] });
  }
  return (
    <div className="body">
      {blocks.map((block, i) => block.table ? (
        <table key={i} className="packtable">
          <thead><tr>{block.lines[0].split(' | ').map((cell, j) => <th key={j}>{cell}</th>)}</tr></thead>
          <tbody>{block.lines.slice(1).map((row, r) => <tr key={r}>{row.split(' | ').map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      ) : <div key={i}>{block.lines.join('\n')}</div>)}
    </div>
  );
}

export function Work({ view, api, onDone }: { view: View; api: string; onDone: () => void }) {
  const { scenario } = view;
  const [messages, setMessages] = useState<PublicMsg[]>(view.messages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [chatError, setChatError] = useState('');
  const [notices, setNotices] = useState<string[]>([]);
  const [guideOnly, setGuideOnly] = useState(view.guideOnly);
  const [input, setInput] = useState('');
  const [brief, setBrief] = useState(view.brief);
  const [left, setLeft] = useState(scenario.timeLimit);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [opened, setOpened] = useState<Record<string, string>>(view.opened);
  const [remaining, setRemaining] = useState(view.remaining);
  const [draftShownAt, setDraftShownAt] = useState<number | null>(view.draftShownAt);
  const [offerShown, setOfferShown] = useState(view.offerShown);
  const events = useRef(Promise.resolve());
  const savedBrief = useRef(view.brief);
  const offset = useRef(view.serverNow - Date.now());
  const endRef = useRef<HTMLDivElement>(null);
  const busy = streaming !== null;
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    const tick = () => setLeft(scenario.timeLimit - (Date.now() + offset.current - (view.startedAt ?? Date.now())) / 1000);
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [view, scenario.timeLimit]);

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

  // The assistant's timed offer arrives a set time after its summary. The server decides when it is due and delivers it once.
  useEffect(() => {
    if (!draftShownAt || offerShown || submitting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      if (cancelled) return;
      if (busyRef.current) { timer = setTimeout(attempt, 1500); return; }
      try {
        const res = await post(`${api}/scripted`);
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { messages: PublicMsg[]; retryInMs?: number };
          if (body.messages.length) { setMessages((m) => [...m, ...body.messages]); setOfferShown(true); return; }
          if (body.retryInMs === undefined) return;
          timer = setTimeout(attempt, Math.max(1000, body.retryInMs - 1000));
        } else if (res.status === 409) {
          const message = await errorOf(res, '');
          if (/still replying/.test(message)) timer = setTimeout(attempt, 1500);
        }
      } catch { timer = setTimeout(attempt, 3000); }
    };
    const dueIn = draftShownAt + scenario.offerDelay * 1000 - (Date.now() + offset.current);
    timer = setTimeout(attempt, Math.max(0, dueIn - 1000));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, draftShownAt, offerShown, submitting, scenario.offerDelay]);

  async function openSource(section: string) {
    // Sources can be opened in any order and at the same time: there is no reading limit.
    setError('');
    try {
      const res = await post(`${api}/event`, { type: 'pack_open', section });
      const body = (await res.json()) as { body?: string | null; remaining?: number; error?: string };
      if (typeof body.remaining === 'number') setRemaining(body.remaining);
      if (res.ok && typeof body.body === 'string') setOpened((o) => ({ ...o, [section]: body.body as string }));
      else if (body.error !== 'budget') setError(body.error ?? 'That source could not be opened.');
    } catch {
      setError('That source could not be opened.');
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || submitting) return;
    setInput('');
    setChatError('');
    setNotices([]);
    setMessages((m) => [...m, { role: 'user', text, ts: Date.now() }]);
    setStreaming('');
    let reply = '';
    let final: PublicMsg | null = null;
    try {
      const res = await post(`${api}/chat`, { text });
      if (!res.ok || !res.body) {
        // Nothing was stored for this message (for example, live chat is unavailable): take it back out of the thread.
        setMessages((m) => m.slice(0, -1));
        setInput(text);
        throw new Error(await errorOf(res, 'The assistant could not reply. Try again.'));
      }
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
          else if (ev.type === 'guardrail') setNotices((n) => (n.includes(ev.kind) ? n : [...n, ev.kind]));
          else if (ev.type === 'error') setChatError(ev.message);
          else if (ev.type === 'message') {
            final = ev.message as PublicMsg;
            if (ev.draftShownAt) setDraftShownAt(ev.draftShownAt);
            if (ev.guideOnly) setGuideOnly(true);
          }
        }
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'The assistant could not reply. Try again.');
    }
    const done: PublicMsg | null = final ?? (reply ? { role: 'assistant', text: reply, ts: Date.now() } : null);
    if (done) setMessages((m) => [...m, done]);
    setStreaming(null);
  }

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await events.current;
      const res = await post(`${api}/submit`, { brief });
      if (!res.ok) throw new Error(await errorOf(res, 'Submission failed. Try again.'));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. Try again.');
      setSubmitting(false);
    }
  }

  const insert = (text: string) => setBrief((b) => (b ? `${b.trimEnd()} ${text}` : text));
  const words = countWords(brief);

  return (
    <div className="work">
      <div className="topbar">
        <span className="title"><b>{scenario.task.title}</b><Restart /></span>
        <span className="muted small">{left <= 0 ? 'Time is up. Submit your brief now.' : 'Time left'}</span>
        <span className={`timer ${left < 60 ? 'low' : ''}`}>{mmss(Math.max(0, left))}</span>
      </div>
      <div className="cols">
        <section className="col references" aria-label="Project references">
          <h2>Project references</h2>
          <div className="scroll">
            <details>
              <summary>Project requirements</summary>
              <div className="body">{scenario.task.prompt}{'\n\n'}{scenario.task.requirements.map((r) => `• ${r}`).join('\n')}</div>
            </details>
            {scenario.pack.map((item) => {
              if (!item.locked) {
                return (
                  <details key={item.id} onToggle={(event) => { if (event.currentTarget.open) record({ type: 'pack_open', section: item.id }); }}>
                    <summary>{item.title}</summary>
                    <PackBody text={item.body ?? ''} />
                  </details>
                );
              }
              // Evidence sources: the text is fetched from the server the first time the section is opened, which also logs the open.
              return (
                <details key={item.id} onToggle={(event) => { if (event.currentTarget.open && opened[item.id] === undefined) openSource(item.id); }}>
                  <summary>{item.title}</summary>
                  {opened[item.id] !== undefined ? <PackBody text={opened[item.id]} /> : <div className="body muted">Loading</div>}
                </details>
              );
            })}
          </div>
        </section>

        <section className="col">
          <h2>AI Chat</h2>
          <div className="scroll" aria-live="polite">
            {messages.length === 0 && !busy && <p className="muted">Tell the assistant what you need for the briefing.</p>}
            {messages.map((m, i) => {
              const [intro, , outro] = m.claims ? m.text.split('\n\n') : [m.text];
              return (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="who">{m.role === 'user' ? 'You' : 'Assistant'}</div>
                  <div className="bubble">{intro}</div>
                  {m.claims?.map((c) => (
                    <div key={c.id} className="claim">
                      <span>{c.text}</span>
                      <button className="small" disabled={submitting || brief.length + c.text.length + 1 > 6000} onClick={() => insert(c.text)}>Insert</button>
                    </div>
                  ))}
                  {m.claims && outro && <div className="bubble" style={{ marginTop: 6 }}>{outro}</div>}
                </div>
              );
            })}
            {busy && <div className="msg assistant"><div className="who">Assistant</div><div className="bubble">{streaming || '…'}</div></div>}
            {notices.filter((n) => NOTICE[n]).map((n) => <div key={n}><span className="notice">{NOTICE[n]}</span></div>)}
            <div ref={endRef} />
          </div>
          {guideOnly && <p className="muted small" role="status">Guide-only mode: the assistant will help you plan and check, not write the paragraph.</p>}
          {chatError && <p role="alert" className="error small">{chatError}</p>}
          <div className="composer">
            <input aria-label="Message the assistant" maxLength={4000} disabled={submitting} type="text" value={input} placeholder="Message the assistant" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="primary" disabled={busy || submitting || !input.trim()} onClick={send}>Send</button>
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
