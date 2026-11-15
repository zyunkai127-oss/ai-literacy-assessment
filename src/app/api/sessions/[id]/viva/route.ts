import { activeAssessments, assessCollaboration } from '@/lib/model-assessment';
import { teacherReviewConfigured } from '@/lib/ops-auth';
import { fail, json, withSession } from '@/lib/api';
import { advance, requireState } from '@/lib/machine';
import { submitAdaptiveAnswer } from '@/lib/adaptive';
import { completeAdaptiveSession, continueAdaptiveSession } from '@/lib/adaptive-session';
import { redactPII } from '@/lib/guardrails';
import { scenario } from '@/lib/scenario';
import { finishSession, getSession, logEvent, observe } from '@/lib/store';

// POST /api/sessions/:id/viva { answer } -> viva to reveal (full version only). Scores the session.
export const POST = withSession(async ({ id }, req) => {
  const body = await req.json();
  const answer = body?.answer;
  const s = getSession(id)!;
  if (activeAssessments.has(id)) return fail(409, 'Your feedback is being prepared.');
  requireState(s.state, 'viva');
  if (s.data.adaptive) {
    const flow = s.data.adaptive;
    const teacherUnavailable = flow.status === 'review' && !teacherReviewConfigured();
    if (body.action === 'finish' && (flow.status === 'unavailable' || teacherUnavailable)) {
      flow.status = 'unavailable';
      completeAdaptiveSession(s); return json({ state: s.state });
    }
    if (body.action === 'retry') {
      if (!['preparing', 'unavailable'].includes(flow.status)) return fail(409, 'There is no interrupted step to retry.');
    } else {
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 1000 || !Number.isInteger(body.turnId)) return fail(400, 'A turn ID and an answer of 1–1000 characters are required.');
      try { submitAdaptiveAnswer(flow, body.turnId, redactPII(answer, scenario.names).text); }
      catch { return fail(409, 'This question is no longer awaiting an answer. Refresh the page.'); }
    }
    activeAssessments.add(id);
    try { await continueAdaptiveSession(s); } finally { activeAssessments.delete(id); }
    return json({ state: s.state });
  }
  const next = advance(s.state, 'viva');
  if (typeof answer !== 'string' || answer.length > 1000) return fail(400, 'answer must be a string of at most 1000 characters');
  if (!s.data.viva) return fail(409, 'No follow-up question was set for this session');
  s.data.viva.answer = answer.trim();
  s.state = next;
  logEvent(s.id, 'viva', { text: s.data.viva.answer });
  activeAssessments.add(id);
  try {
    finishSession(s, await assessCollaboration(scenario, observe(s, scenario.time_limit_s[s.mode])));
  } finally {
    activeAssessments.delete(id);
  }
  return json({ state: s.state });
});
