import { fail, withSession } from '@/lib/api';
import { detectGhostwrite, detectInjection, INJECTION_REPLY, redactPII } from '@/lib/guardrails';
import { streamReply } from '@/lib/llm';
import { requireState } from '@/lib/machine';
import { draftText, publicClaims, scenario } from '@/lib/scenario';
import { claimsFor } from '@/lib/scoring';
import { getSession, logEvent, saveSession } from '@/lib/store';

const DOUBT = /\b(sure|real|really|true|correct|right|accurate|source|where|check|verify|exist|genuine|trust|wrong|evidence|prove|proof|made up|fake|reliable|legit)\b|\?/i;
const GENERIC_DOUBT = /(are you sure|is (this|that|everything|it all|the draft) (right|correct|accurate|true)|any (errors|mistakes)|double.?check|anything wrong)/i;
const STAND_BY = "I've re-checked the draft and I'm confident each statement reflects the sources.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/sessions/:id/chat { text } -> text/event-stream of JSON events:
//   {type:'guardrail',kind} | {type:'delta',text} | {type:'claims',claims} | {type:'done'}
export const POST = withSession(async (s, req) => {
  requireState(s.state, 'work');
  const { text } = (await req.json()) as { text?: string };
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return fail(400, 'text must be 1 to 4000 characters');

  const started = Date.now();
  const first = s.data.turns === 0;

  // Guardrail pipeline, in code, before anything reaches a model.
  const pii = redactPII(text, scenario.names);
  const injection = detectInjection(text);
  const ghost = !first && detectGhostwrite(text);
  const triggered: string[] = [];
  if (pii.names.length || pii.other) {
    triggered.push('pii');
    s.data.namesSent = [...new Set([...s.data.namesSent, ...pii.names])];
    logEvent(s.id, 'guardrail', { kind: 'pii', names: pii.names.length, other: pii.other });
  }
  if (injection) { triggered.push('injection'); logEvent(s.id, 'guardrail', { kind: 'injection' }); }
  if (ghost) { triggered.push('ghostwrite'); s.data.ghostwrite = true; logEvent(s.id, 'guardrail', { kind: 'ghostwrite' }); }

  // Route the reply. Pre-written statements are returned verbatim so a model can never quietly correct them.
  let scripted: string | null = null;
  let withClaims = false;
  if (first) {
    s.data.firstInstruction = pii.text;
    scripted = draftText(s.mode);
    withClaims = true;
  } else if (injection) {
    scripted = INJECTION_REPLY;
  } else if (!ghost && DOUBT.test(text)) {
    const lower = text.toLowerCase();
    const hit = claimsFor(scenario, s.mode)
      .map((c) => ({ c, n: c.ask_markers.filter((m) => lower.includes(m)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0];
    if (hit) {
      scripted = hit.c.reask_text;
      s.data.queried = [...new Set([...s.data.queried, hit.c.id])];
      logEvent(s.id, 'claim_query', { claim: hit.c.id });
    } else if (GENERIC_DOUBT.test(text)) {
      scripted = STAND_BY;
    }
  }

  s.data.turns += 1;
  s.data.messages.push({ role: 'user', text: pii.text, ts: started });
  saveSession(s);
  logEvent(s.id, 'chat_user', { text: pii.text, turn: s.data.turns });

  const history = [...s.data.messages];
  const limit = scenario.time_limit_s[s.mode];
  const secondsLeft = limit - (started - (s.startedAt ?? started)) / 1000;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // The browser may disconnect mid-stream; the reply is still saved and logged.
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch {} };
      let reply = '';
      let firstTokenMs: number | null = null;
      let source: string = 'scripted';
      let error: string | undefined;
      const emit = (t: string) => {
        if (firstTokenMs === null) firstTokenMs = Date.now() - started;
        reply += t;
        send({ type: 'delta', text: t });
      };
      try {
        for (const kind of triggered) send({ type: 'guardrail', kind });
        if (scripted !== null) {
          for (const word of scripted.split(/(?<=\s)/)) { emit(word); await sleep(14); }
        } else {
          const gen = streamReply(history, { guideOnly: s.data.ghostwrite, secondsLeft, draft: draftText(s.mode) });
          let step = await gen.next();
          while (!step.done) { emit(step.value); step = await gen.next(); }
          source = step.value.source;
          error = step.value.error;
        }
        if (withClaims) send({ type: 'claims', claims: publicClaims(s.mode) });
      } catch (e) {
        error = String(e);
        send({ type: 'error', message: 'The assistant could not reply. Try again.' });
      } finally {
        // Re-read so events recorded while streaming (for example a source being opened) are not overwritten.
        const fresh = getSession(s.id);
        if (fresh && reply) {
          const ts = Date.now();
          fresh.data.messages.push({ role: 'assistant', text: reply, ts, ...(withClaims ? { claims: publicClaims(s.mode) } : {}) });
          if (withClaims) fresh.data.draftShownAt = ts;
          saveSession(fresh);
        }
        logEvent(s.id, 'chat_assistant', { source, firstTokenMs, totalMs: Date.now() - started, chars: reply.length, guardrails: triggered, ...(error ? { error } : {}) });
        send({ type: 'done' });
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
});
