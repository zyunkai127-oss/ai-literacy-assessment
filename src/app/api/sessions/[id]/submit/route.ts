import { fail, json, withSession } from '@/lib/api';
import { activeChats } from '@/lib/chatlock';
import { advance } from '@/lib/machine';
import { wordCount } from '@/lib/scoring';
import { getSession, logEvent, saveSession } from '@/lib/store';

// POST /api/sessions/:id/submit { brief } -> work to debrief. Scoring happens after the debrief (and the follow-up question in the full version).
export const POST = withSession(async ({ id }, req) => {
  const body = await req.json();
  const s = getSession(id)!;
  const next = advance(s.state, 'work');
  const brief = body?.brief;
  if (typeof brief !== 'string' || !wordCount(brief)) return fail(400, 'Write a brief before submitting');
  if (brief.length > 6000) return fail(400, 'Your brief is too long');
  if (activeChats.has(id)) return fail(409, 'The assistant is still replying. Submit when it finishes.');
  s.data.brief = brief.trim();
  s.data.submittedAt = Date.now();
  s.state = next;
  saveSession(s);
  logEvent(s.id, 'submit', { words: wordCount(s.data.brief), text: s.data.brief });
  return json({ state: s.state });
});
