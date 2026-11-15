import { json } from '@/lib/api';
import { allEvents, sessionCounts } from '@/lib/store';

export const dynamic = 'force-dynamic';

// GET /api/ops -> guardrail triggers, verification-budget blocks, offer responses, response latency and session counts for the last 24 hours.
export function GET() {
  const events = allEvents(Date.now() - 24 * 3600 * 1000);
  const guardrails: Record<string, number> = {};
  for (const e of events) if (e.type === 'guardrail') guardrails[e.payload.kind] = (guardrails[e.payload.kind] ?? 0) + 1;
  const count = (type: string, test: (payload: Record<string, unknown>) => boolean = () => true) => events.filter((e) => e.type === type && test(e.payload)).length;
  const replies = events.filter((e) => e.type === 'chat_assistant');
  const stats = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return { n: s.length, avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length), p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] };
  };
  const bySource = (src: string) => replies.filter((e) => e.payload.source === src);
  return json({
    sessions: sessionCounts(),
    events: events.length,
    guardrails,
    guardrailActions: {
      pii: 'Names, emails and phone numbers are removed before the message is stored or sent',
      injection: 'Fixed refusal; the message never reaches the model',
      ghostwrite: 'Assistant switches to guide-only for the rest of the session',
    },
    budgetBlocks: count('budget_block'),
    offer: { shown: count('offer_shown'), accepted: count('offer_response', (p) => p.accepted === true), declined: count('offer_response', (p) => p.accepted === false) },
    claimQueries: count('claim_query'),
    replies: { scripted: bySource('scripted').length, model: bySource('model').length, failed: bySource('error').length },
    modelFirstTokenMs: stats(bySource('model').map((e) => e.payload.firstTokenMs)),
    modelTotalMs: stats(bySource('model').map((e) => e.payload.totalMs)),
    errors: bySource('error').filter((e) => e.payload.error).slice(-5).map((e) => e.payload.error),
  });
}
