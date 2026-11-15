import { fail, json, withSession } from '@/lib/api';
import { reviewAuthorized, sameOrigin } from '@/lib/ops-auth';
import { resolveAdaptiveReview } from '@/lib/adaptive-runner';
import { completeAdaptiveSession } from '@/lib/adaptive-session';
import { activeAssessments } from '@/lib/model-assessment';
import { logEvent, saveSession } from '@/lib/store';
export const POST = withSession(async (s, req) => {
  if (!sameOrigin(req) || !reviewAuthorized(req)) return fail(403, 'Teacher access is required.');
  if (activeAssessments.has(s.id)) return fail(409, 'This session is still being processed.');
  if (s.state !== 'viva' || !s.data.adaptive) return fail(409, 'No follow-up is awaiting review.');
  const body = await req.json();
  try { resolveAdaptiveReview(s.data.adaptive, body); }
  catch { return fail(400, 'Choose a valid action, judgement and follow-up question.'); }
  logEvent(s.id, 'adaptive_human', { action: body.action, outcome: body.outcome, questionId: body.questionId });
  if (s.data.adaptive.status === 'complete') completeAdaptiveSession(s);
  else saveSession(s);
  return json({ state: s.state });
});
