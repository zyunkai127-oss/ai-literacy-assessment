import { json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { logEvent, saveSession } from '@/lib/store';

// POST /api/sessions/:id/teammate -> delivers the scripted teammate message once (full mode, after the draft).
export const POST = withSession((s) => {
  requireState(s.state, 'work');
  const d = s.data;
  const due = s.mode === 'full' && d.draftShownAt && !d.teammateAt && Date.now() - d.draftShownAt >= (scenario.teammate.delay_s - 2) * 1000;
  if (!due) return json({ message: null });
  const message = { role: 'teammate' as const, text: scenario.teammate.text, ts: Date.now() };
  d.teammateAt = message.ts;
  d.messages.push(message);
  saveSession(s);
  logEvent(s.id, 'teammate_msg', {});
  return json({ message, from: scenario.teammate.from });
});
