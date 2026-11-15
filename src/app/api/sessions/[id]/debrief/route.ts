import { activeAssessments, assessCollaboration } from '@/lib/model-assessment';
import { fail, json, withSession } from '@/lib/api';
import { advance } from '@/lib/machine';
import { publicClaims, scenario } from '@/lib/scenario';
import { startAdaptive } from '@/lib/adaptive';
import { continueAdaptiveSession } from '@/lib/adaptive-session';
import { finishSession, getSession, logEvent, observe, saveSession } from '@/lib/store';
import type { Decision, Declared } from '@/lib/types';

const DECISIONS: Decision[] = ['relied', 'unsure', 'not'];
const DECLARED: Declared[] = ['MINE', 'MIXED', 'AI'];

// POST /api/sessions/:id/debrief { decisions: { [claimId]: 'relied'|'unsure'|'not' }, confidence: 0..100, declared: 'MINE'|'MIXED'|'AI' }
// Quick version: debrief -> reveal (scored here). Full version: debrief -> viva, returns the follow-up question.
export const POST = withSession(async ({ id }, req) => {
  const body = (await req.json()) as { decisions?: Record<string, unknown>; confidence?: unknown; declared?: unknown };
  const s = getSession(id)!;
  if (activeAssessments.has(id)) return fail(409, 'Your feedback is being prepared.');
  const next = advance(s.state, 'debrief', s.mode === 'full' ? 'viva' : 'reveal');

  const decisions = body?.decisions ?? {};
  if (typeof decisions !== 'object' || Array.isArray(decisions)) return fail(400, 'decisions must be an object');
  const shown = s.data.draftShownAt ? publicClaims(s.mode).map((c) => c.id) : [];
  for (const [claimId, decision] of Object.entries(decisions)) {
    if (!shown.includes(claimId)) return fail(400, `Unknown statement "${claimId}"`);
    if (!DECISIONS.includes(decision as Decision)) return fail(400, 'Each decision must be "relied", "unsure" or "not"');
  }
  const pick = (d: Decision) => shown.filter((claimId) => decisions[claimId] === d);
  if (pick('unsure').length > 2) return fail(400, 'Choose "Not sure" for at most 2 statements');
  const confidence = body.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) return fail(400, 'confidence must be a number from 0 to 100');
  if (!DECLARED.includes(body.declared as Declared)) return fail(400, 'declared must be "MINE", "MIXED" or "AI"');

  // Stored before anything is scored or selected: the follow-up question and E1 both depend on these answers.
  s.data.debrief = { flagged: pick('not'), leastSure: pick('unsure'), confidence: confidence / 100, declared: body.declared as Declared };
  logEvent(s.id, 'debrief', { ...s.data.debrief });
  const limit = scenario.time_limit_s[s.mode];
  s.state = next;

  if (next === 'viva') {
    activeAssessments.add(id);
    try {
      s.data.adaptive = startAdaptive(await assessCollaboration(scenario, observe(s, limit)));
      saveSession(s);
      await continueAdaptiveSession(s);
    } finally { activeAssessments.delete(id); }
    return json({ state: s.state });
  }
  activeAssessments.add(id);
  try {
    finishSession(s, await assessCollaboration(scenario, observe(s, limit)));
  } finally {
    activeAssessments.delete(id);
  }
  return json({ state: s.state });
});
