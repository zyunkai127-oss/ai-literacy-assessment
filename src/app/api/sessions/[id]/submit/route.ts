import { fail, json, withSession } from '@/lib/api';
import { advance } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { claimsFor, findMarker } from '@/lib/scoring';
import { logEvent, saveSession } from '@/lib/store';

// POST /api/sessions/:id/submit { brief } -> work to debrief. Returns the supervisor's follow-up question.
export const POST = withSession(async (s, req) => {
  const { brief } = (await req.json()) as { brief?: string };
  if (typeof brief !== 'string' || brief.trim().split(/\s+/).length < 20) return fail(400, 'Your brief needs at least 20 words before you can submit');
  if (brief.length > 6000) return fail(400, 'Your brief is too long');
  s.state = advance(s.state, 'work');
  s.data.brief = brief.trim();
  s.data.submittedAt = Date.now();
  // A question about the student's own record. It quotes their text only, so it gives nothing away.
  const used = claimsFor(scenario, s.mode).map((c) => findMarker(brief, [...c.error_markers, ...(c.fixed_markers ?? []), ...c.keep_markers])).find(Boolean);
  s.data.followUp = used
    ? `You wrote "${used}" in your brief. What did you base that on?`
    : 'Your brief uses little of what the assistant suggested. What made you leave it out?';
  saveSession(s);
  logEvent(s.id, 'submit', { words: brief.trim().split(/\s+/).length, text: s.data.brief });
  return json({ state: s.state, followUp: s.data.followUp });
});
