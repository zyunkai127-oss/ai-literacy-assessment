import { fail, json, withSession } from '@/lib/api';
import { advance } from '@/lib/machine';
import { draftText, publicClaims, scenario } from '@/lib/scenario';
import { scoreSession } from '@/lib/scoring';
import { logEvent, observe, saveSession, scrubIfNotStored } from '@/lib/store';

// POST /api/sessions/:id/debrief { flagged: string[], confidence: 0..100, answer: string } -> debrief to reveal. Scoring happens here, on the server.
export const POST = withSession(async (s, req) => {
  const body = (await req.json()) as { flagged?: unknown; confidence?: unknown; answer?: unknown };
  const valid = new Set(publicClaims(s.mode).map((c) => c.id));
  if (!Array.isArray(body.flagged) || body.flagged.some((id) => !valid.has(id as string))) return fail(400, 'flagged must be a list of statement ids');
  if (typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 100) return fail(400, 'confidence must be a number from 0 to 100');
  s.state = advance(s.state, 'debrief');
  s.data.debrief = { flagged: body.flagged as string[], confidence: body.confidence / 100, answer: String(body.answer ?? '').slice(0, 1000) };
  const o = observe(s);
  const limit = scenario.time_limit_s[s.mode];
  o.overtime = !!s.startedAt && !!s.data.submittedAt && (s.data.submittedAt - s.startedAt) / 1000 > limit + 5;
  s.data.result = scoreSession(scenario, o, draftText(s.mode));
  logEvent(s.id, 'debrief', { flagged: body.flagged, confidence: body.confidence, answer: s.data.debrief.answer });
  logEvent(s.id, 'scored', { nodes: s.data.result.nodes.map((n) => [n.id, n.score]) });
  if (!s.store) {
    // No consent to store: keep the scores for this person's own results page, drop their words.
    s.data.messages = [];
    s.data.brief = '';
    s.data.firstInstruction = '';
    s.data.debrief.answer = '';
    scrubIfNotStored(s);
  }
  saveSession(s);
  return json({ state: s.state });
});
