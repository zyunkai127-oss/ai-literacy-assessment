import { fail, withSession } from '@/lib/api';
import { detectGhostwrite, detectInjection, redactPII } from '@/lib/guardrails';
import { llmAvailable, streamReply } from '@/lib/llm';
import { requireState } from '@/lib/machine';
import { isGreeting, scenario } from '@/lib/scenario';
import { claimsFor, findMarker } from '@/lib/scoring';
import { getSession, logEvent, saveSession } from '@/lib/store';

const activeChats = new Set<string>();

// POST /api/sessions/:id/chat { text } -> text/event-stream of JSON events:
//   {type:'guardrail',kind} | {type:'delta',text} | {type:'error',message} | {type:'done'}
export const POST = withSession(async ({ id }, req) => {
  const text = (await req.json())?.text;
  const s = getSession(id)!;
  requireState(s.state, 'work');
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return fail(400, 'text must be 1 to 4000 characters');

  if (!llmAvailable()) return fail(503, 'Live AI chat is unavailable. You can keep working with the source pack and Brief editor.');
  if (activeChats.has(id)) return fail(409, 'The assistant is still replying. Send your next message when it finishes.');

  const started = Date.now();

  // Guardrail pipeline, in code, before anything reaches a model.
  const pii = redactPII(text, scenario.names);
  const injection = detectInjection(text);
  const ghost = !injection && detectGhostwrite(text);
  const triggered: string[] = [];
  if (pii.names.length || pii.other) {
    triggered.push('pii');
    s.data.namesSent = [...new Set([...s.data.namesSent, ...pii.names])];
    logEvent(s.id, 'guardrail', { kind: 'pii', names: pii.names.length, other: pii.other });
  }
  if (injection) logEvent(s.id, 'guardrail', { kind: 'injection' });
  if (ghost) { s.data.ghostwrite = true; logEvent(s.id, 'guardrail', { kind: 'ghostwrite' }); }

  if (!injection && !s.data.firstInstruction && !isGreeting(text)) s.data.firstInstruction = pii.text;
  if (!injection && s.data.draftShownAt && /\?|\b(?:check|sure|verify|source)\b/i.test(pii.text)) {
    const queried = claimsFor(scenario, s.mode).filter((item) =>
      (!s.data.controlledClaimId || item.id === s.data.controlledClaimId) && findMarker(pii.text, item.error_markers));
    s.data.queried = [...new Set([...s.data.queried, ...queried.map((item) => item.id)])];
  }

  s.data.turns += 1;
  s.data.messages.push({ role: 'user', text: pii.text, ts: started });
  saveSession(s);
  logEvent(s.id, 'chat_user', { text: pii.text, turn: s.data.turns });

  const history = [...s.data.messages];
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
        const gen = streamReply(history);
        let step = await gen.next();
        while (!step.done) { emit(step.value); step = await gen.next(); }
        error = step.value.error;
        if (error) send({ type: 'error', message: error });
      } catch {
        error = 'The assistant could not reply. Try again.';
        send({ type: 'error', message: error });
      } finally {
        try {
          // Re-read so activity recorded during streaming is retained.
          const fresh = getSession(id);
          if (fresh?.state === 'work') {
            if (reply) {
              fresh.data.messages.push({ role: 'assistant', text: reply, ts: Date.now() });
              saveSession(fresh);
            }
            logEvent(id, 'chat_assistant', { source: error ? 'error' : 'model', firstTokenMs, totalMs: Date.now() - started, chars: reply.length, guardrails: triggered, ...(error ? { error } : {}) });
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
