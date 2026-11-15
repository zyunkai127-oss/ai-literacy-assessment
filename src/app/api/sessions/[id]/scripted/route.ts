import { fail, json, withSession } from '@/lib/api';
import { activeChats } from '@/lib/chatlock';
import { requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { getSession, logEvent, saveSession } from '@/lib/store';
import type { Msg } from '@/lib/types';

// POST /api/sessions/:id/scripted -> { messages } with the timed, pre-written messages that are now due.
// Currently one: the assistant's offer to write the final paragraph, delivered once, a set time after the summary.
export const POST = withSession(({ id }) => {
  const s = getSession(id)!;
  requireState(s.state, 'work');
  const d = s.data;
  if (!d.draftShownAt || d.p2ShownAt) return json({ messages: [] });
  const dueAt = d.draftShownAt + scenario.ghostwrite_offer.delay_s[s.mode] * 1000;
  const now = Date.now();
  if (now < dueAt - 2000) return json({ messages: [], retryInMs: dueAt - now });
  if (activeChats.has(id)) return fail(409, 'The assistant is still replying.');
  const message: Msg = { role: 'assistant', text: scenario.ghostwrite_offer.text, ts: now, scripted: 'offer' };
  d.messages.push(message);
  d.p2ShownAt = now;
  saveSession(s);
  logEvent(s.id, 'offer_shown', {});
  logEvent(s.id, 'chat_assistant', { source: 'scripted', kind: 'offer', chars: message.text.length });
  return json({ messages: [{ role: message.role, text: message.text, ts: message.ts, scripted: 'offer' }] });
});
