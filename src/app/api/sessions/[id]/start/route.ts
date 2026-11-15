import { json, withSession } from '@/lib/api';
import { advance } from '@/lib/machine';
import { logEvent, saveSession } from '@/lib/store';

// POST /api/sessions/:id/start -> intro to work; the clock starts here.
export const POST = withSession((s) => {
  s.state = advance(s.state, 'intro');
  s.startedAt = Date.now();
  saveSession(s);
  logEvent(s.id, 'start', {});
  return json({ state: s.state, startedAt: s.startedAt });
});
