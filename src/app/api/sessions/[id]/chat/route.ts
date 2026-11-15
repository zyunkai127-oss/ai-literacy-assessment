import { fail, withSession } from '@/lib/api';
import { activeChats } from '@/lib/chatlock';
import { detectGhostwrite, detectInjection, INJECTION_REPLY, redactPII } from '@/lib/guardrails';
import { llmAvailable, streamReply } from '@/lib/llm';
import { requireState } from '@/lib/machine';
import { draftText, isGreeting, publicClaims, scenario } from '@/lib/scenario';
import { getSession, logEvent, saveSession } from '@/lib/store';
import type { Msg } from '@/lib/types';

const GUIDE = "I can't write the finished paragraph for you: the assignment says it has to be in your own words. I can still help you plan it. Try one sentence on how many students use AI, one on what the quiz shows and how sure we can be, one student view, then your own conclusion. Which part do you want to start with?";
const SUMMARY_REQUEST = 'Give me a summary of the evidence.';
// A typed request for a summary gets the same pre-written summary as the button.
const ASKS_SUMMARY = /\b(?:summar(?:y|ise|ize)|overview|key (?:findings|figures|points))\b[^?.!]*\b(?:evidence|sources?|findings|research|data|survey|pack)\b|\b(?:evidence|research) summary\b/i;
const UNAVAILABLE = 'Live AI chat is unavailable. You can keep working with the source pack and Brief editor.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /api/sessions/:id/chat { text } -> text/event-stream of JSON events:
//   {type:'guardrail',kind} | {type:'delta',text} | {type:'message',message} | {type:'error',message} | {type:'done'}
//
// POST { action: 'summary' } instead of text asks for the assistant's evidence summary.
//
// Guardrails run first. The evidence summary is pre-written and identical for every student (the embedded layer:
// see docs/05). Every other ordinary message goes to the live model.
export const POST = withSession(async ({ id }, req) => {
  const body = await req.json();
  const wantsSummary = body?.action === 'summary';
  const text = wantsSummary ? SUMMARY_REQUEST : body?.text;
  const s = getSession(id)!;
  requireState(s.state, 'work');
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return fail(400, 'text must be 1 to 4000 characters');
  if (activeChats.has(id)) return fail(409, 'The assistant is still replying. Send your next message when it finishes.');

  const started = Date.now();
  const d = s.data;

  // 1. Guardrail pipeline, before anything reaches a model.
  const pii = redactPII(text, scenario.names);
  const injection = detectInjection(text);
  const triggered: string[] = [];
  if (pii.names.length || pii.other) {
    triggered.push('pii');
    d.namesSent = [...new Set([...d.namesSent, ...pii.names])];
    logEvent(s.id, 'guardrail', { kind: 'pii', names: pii.names.length, other: pii.other });
  }

  // 2. Choose the reply.
  let scripted: { kind: NonNullable<Msg['scripted']>; text: string; claims?: Msg['claims'] } | null = null;
  if (injection) {
    // Fixed refusal. The message is stored for the record but never sent to the model, now or as history.
    triggered.push('injection');
    logEvent(s.id, 'guardrail', { kind: 'injection' });
    scripted = { kind: 'refusal', text: INJECTION_REPLY };
  } else {
    if (detectGhostwrite(text)) {
      d.ghostRequested = true;
      d.ghostwrite = true;
      triggered.push('ghostwrite');
      logEvent(s.id, 'guardrail', { kind: 'ghostwrite', via: 'request' });
      scripted = { kind: 'guide', text: GUIDE };
    }
    if (!scripted && !d.draftShownAt && (wantsSummary || ASKS_SUMMARY.test(text))) {
      // Verbatim, never rewritten by a model, so every student sees the same statements.
      scripted = { kind: 'draft', text: draftText(s.mode), claims: publicClaims(s.mode) };
      logEvent(s.id, 'embedded_summary', { via: wantsSummary ? 'button' : 'message' });
    }
    if (!d.firstInstruction && !wantsSummary && !isGreeting(text)) d.firstInstruction = pii.text;
  }

  // Only free chat needs the live model. Flags set above are kept even when it is unavailable.
  if (!scripted && !llmAvailable()) {
    saveSession(s);
    return fail(503, UNAVAILABLE);
  }

  d.turns += 1;
  d.messages.push({ role: 'user', text: pii.text, ts: started, ...(injection ? { blocked: true } : {}) });
  saveSession(s);
  logEvent(s.id, 'chat_user', { text: pii.text, turn: d.turns });

  const history = [...d.messages];
  const secondsLeft = scenario.time_limit_s[s.mode] - (started - (s.startedAt ?? started)) / 1000;
  const persona = { mode: s.mode, guideOnly: d.ghostwrite, secondsLeft, summaryShown: !!d.draftShownAt };
  activeChats.add(id);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // The browser may disconnect mid-stream; the reply is still saved and logged.
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch {} };
      let reply = '';
      let firstTokenMs: number | null = null;
      let error: string | undefined;
      const emit = (t: string) => {
        if (firstTokenMs === null) firstTokenMs = Date.now() - started;
        reply += t;
        send({ type: 'delta', text: t });
      };
      try {
        for (const kind of triggered) send({ type: 'guardrail', kind });
        if (scripted) {
          for (const piece of scripted.text.match(/\S+\s*/g) ?? []) { emit(piece); await sleep(12); }
        } else {
          const gen = streamReply(history, persona);
          let step = await gen.next();
          while (!step.done) { emit(step.value); step = await gen.next(); }
          error = step.value.error;
          if (error) send({ type: 'error', message: error });
        }
      } catch {
        error = 'The assistant could not reply. Try again.';
        send({ type: 'error', message: error });
      } finally {
        try {
          // Re-read so activity recorded during streaming is retained.
          const fresh = getSession(id);
          if (fresh?.state === 'work') {
            if (scripted) reply = scripted.text;
            if (reply) {
              const message: Msg = { role: 'assistant', text: reply, ts: Date.now(), ...(error ? { failed: true } : {}), ...(scripted ? { scripted: scripted.kind } : {}), ...(scripted?.claims ? { claims: scripted.claims } : {}) };
              fresh.data.messages.push(message);
              if (scripted?.kind === 'draft' && !fresh.data.draftShownAt) fresh.data.draftShownAt = message.ts;
              saveSession(fresh);
              send({ type: 'message', message: { role: message.role, text: message.text, ts: message.ts, ...(message.claims ? { claims: message.claims } : {}) }, draftShownAt: fresh.data.draftShownAt ?? null, guideOnly: fresh.data.ghostwrite });
            }
            logEvent(id, 'chat_assistant', { source: error ? 'error' : scripted ? 'scripted' : 'model', ...(scripted ? { kind: scripted.kind } : {}), firstTokenMs, totalMs: Date.now() - started, chars: reply.length, guardrails: triggered, ...(error ? { error } : {}) });
          }
        } catch {
          send({ type: 'error', message: 'The conversation could not be saved.' });
        } finally {
          activeChats.delete(id);
          send({ type: 'done' });
          try { controller.close(); } catch {}
        }
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
});
