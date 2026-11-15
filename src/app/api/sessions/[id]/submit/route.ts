import { fail, json, withSession } from '@/lib/api';
import { advance, requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { scoreSession, wordCount } from '@/lib/scoring';
import { finishSession, getSession, observe } from '@/lib/store';

// POST /api/sessions/:id/submit { brief } -> work to reveal. An older pending submission already has its brief.
export const POST = withSession(async ({ id }, req) => {
  const body = await req.json();
  const s = getSession(id)!;
  if (s.state === 'reveal') return json({ state: s.state });
  if (s.state !== 'debrief') {
    requireState(s.state, 'work');
    const brief = body?.brief;
    if (typeof brief !== 'string' || !wordCount(brief)) return fail(400, 'Write a brief before submitting');
    if (brief.length > 6000) return fail(400, 'Your brief is too long');
    s.data.brief = brief.trim();
    s.data.submittedAt = Date.now();
  }

  s.state = advance(s.state, s.state);
  const result = scoreSession(scenario, observe(s, scenario.time_limit_s[s.mode]));
  finishSession(s, result);
  return json({ state: s.state });
});
