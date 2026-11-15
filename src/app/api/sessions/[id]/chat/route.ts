import { fail, withSession } from '@/lib/api';
import { activeChats } from '@/lib/chatlock';
import { detectAccept, detectGhostwrite, detectInjection, INJECTION_REPLY, redactPII } from '@/lib/guardrails';
import { llmAvailable, streamReply } from '@/lib/llm';
import { requireState } from '@/lib/machine';
import { draftText, isGreeting, publicClaims, scenario } from '@/lib/scenario';
import { claimsFor, wordCount } from '@/lib/scoring';
import { getSession, logEvent, saveSession } from '@/lib/store';
import type { Msg } from '@/lib/types';

// A message counts as doubting a statement when it has a doubt word and names the statement (its ask_markers).
const DOUBT = /\b(sure|real|really|true|correct|right|accurate|source|sources|where|check|checked|verify|verified|exist|exists|genuine|trust|wrong|evidence|prove|proves|proof|made up|fake|reliable|legit|certain|confident|come from|how do you know|mistake|error)\b/i;
const GENERIC_DOUBT = /(are you sure|is (this|that|everything|it all|the summary) (right|correct|accurate|true)|any (errors|mistakes)|double.?check|anything wrong)/i;
const STAND_BY = "I've re-checked the summary and I'm confident each statement reflects the sources.";
const GREETING = 'Hi! Tell me what you need for the briefing and I will pull together the evidence.';
const GUIDE = "I can't write the finished paragraph for you: the assignment says it has to be in your own words. I can still help you plan it. Try one sentence on how many students use AI, one on what the quiz shows and how sure we can be, one student view, then your own conclusion. Which part do you want to start with?";
const OFFER_INTRO = 'Here is a paragraph you can submit:\n\n';
const DECLINED = 'No problem. I am here if you want help with structure or wording.';
const UNAVAILABLE = 'Live AI chat is unavailable. You can keep working with the source pack and Brief editor.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /api/sessions/:id/chat { text } -> text/event-stream of JSON events:
//   {type:'guardrail',kind} | {type:'delta',text} | {type:'message',message} | {type:'error',message} | {type:'done'}
//
// Hybrid routing (merge decision D1). Guardrails run first, in code. Pre-written replies are returned verbatim,
// so a model can never quietly correct them and they work with no API key. Everything else goes to the live model.
export const POST = withSession(async ({ id }, req) => {
  const text = (await req.json())?.text;
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
    const ghostAsk = detectGhostwrite(text);
    if (d.p2ShownAt && !d.p2Responded) {
      // The first message after the assistant's offer to write the final paragraph is the student's answer to it.
      d.p2Responded = true;
      d.p2Accepted = ghostAsk || detectAccept(text, scenario.accept_markers);
      logEvent(s.id, 'offer_response', { accepted: d.p2Accepted });
      if (d.p2Accepted) {
        // The assistant made the offer, so it keeps its word and writes a pre-written paragraph built from its own summary.
        // Whether the student hands that wording in is judged from the submitted brief, not from saying yes.
        scripted = { kind: 'ghost', text: `${OFFER_INTRO}${scenario.ghostwrite_offer.paragraph}` };
      } else if (wordCount(text) <= 8 && !text.includes('?')) {
        scripted = { kind: 'greeting', text: DECLINED };
      }
    } else if (ghostAsk && d.draftShownAt) {
      // An unprompted request for finished work: the assistant switches to guide-only for the rest of the session.
      d.ghostRequested = true;
      d.ghostwrite = true;
      triggered.push('ghostwrite');
      logEvent(s.id, 'guardrail', { kind: 'ghostwrite', via: 'request' });
      scripted = { kind: 'guide', text: GUIDE };
    }

    if (!scripted && !d.draftShownAt) {
      if (!isGreeting(text)) {
        // The first task instruction returns the pre-written research summary, with its statements listed for insertion.
        d.firstInstruction = pii.text;
        d.draftShownAt = started + 1;
        scripted = { kind: 'draft', text: draftText(s.mode), claims: publicClaims(s.mode) };
        logEvent(s.id, 'summary_shown', {});
      } else if (!llmAvailable()) {
        scripted = { kind: 'greeting', text: GREETING };
      }
    } else if (!scripted && DOUBT.test(pii.text)) {
      // Doubt about a specific statement: the assistant stands by it, right or wrong.
      const lower = pii.text.toLowerCase();
      const hit = claimsFor(scenario, s.mode)
        .map((claim) => ({ claim, n: claim.ask_markers.filter((marker) => lower.includes(marker)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)[0];
      if (hit) {
        scripted = { kind: 'reask', text: hit.claim.reask_text };
        if (!d.queried.includes(hit.claim.id)) d.queried.push(hit.claim.id);
        d.queriedAt = { ...(d.queriedAt ?? {}), [hit.claim.id]: d.queriedAt?.[hit.claim.id] ?? started };
        logEvent(s.id, 'claim_query', { claim: hit.claim.id });
      } else if (GENERIC_DOUBT.test(pii.text)) {
        scripted = { kind: 'reask', text: STAND_BY };
      }
    }
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
  const persona = { mode: s.mode, guideOnly: d.ghostwrite, secondsLeft, summaryGiven: !!d.draftShownAt };
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
              const message: Msg = { role: 'assistant', text: reply, ts: Date.now(), ...(scripted ? { scripted: scripted.kind } : {}), ...(scripted?.claims ? { claims: scripted.claims } : {}) };
              fresh.data.messages.push(message);
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
