import { activeAssessments, assessCollaboration } from '@/lib/model-assessment';
import { fail, json, withSession } from '@/lib/api';
import { advance } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { finishSession, getSession, logEvent, observe } from '@/lib/store';

// POST /api/sessions/:id/viva { answer } -> viva to reveal (full version only). Scores the session.
export const POST = withSession(async ({ id }, req) => {
  const answer = (await req.json())?.answer;
  const s = getSession(id)!;
  if (activeAssessments.has(id)) return fail(409, 'Your feedback is being prepared.');
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
