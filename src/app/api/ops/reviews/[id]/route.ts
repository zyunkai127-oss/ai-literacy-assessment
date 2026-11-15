import { fail, json, withSession } from '@/lib/api';
import { reviewAuthorized, sameOrigin } from '@/lib/ops-auth';
import { resolveAdaptiveReview } from '@/lib/adaptive-runner';
import { completeAdaptiveSession } from '@/lib/adaptive-session';
import { activeAssessments } from '@/lib/model-assessment';
import { logEvent, saveSession, updatePendingReview } from '@/lib/store';
export const POST = withSession(async ({ id }, req) => {
  if (!sameOrigin(req) || !reviewAuthorized(req)) return fail(403, 'Teacher access is required.');
  const body = await req.json();
  if (!Number.isInteger(body?.round) || body.round < 0 || body.round > 2) return fail(400, 'A valid review round is required.');
  if (activeAssessments.has(id)) return fail(409, 'This session is still being processed.');
  let invalid = false;
  const applied = updatePendingReview(id, body.round, s => {
    const flow = s.data.adaptive!;
    try { resolveAdaptiveReview(flow, body); }
    catch { invalid = true; return; }
    logEvent(id, 'adaptive_human', { action: body.action, outcome: body.outcome, questionId: body.action === 'ask' ? body.questionId : '' });
    if (flow.status === 'complete') completeAdaptiveSession(s);
    else saveSession(s);
  });
  if (!applied) return fail(409, 'This review has changed. Refresh the review list.');
  if (invalid) return fail(400, 'Choose a valid action, judgement and follow-up question.');
  return json({ state: body.action === 'finish' ? 'reveal' : 'viva' });
});
