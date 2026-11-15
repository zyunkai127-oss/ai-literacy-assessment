import { fail, json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';
import { evidenceBody, isEvidence, openedEvidence, scenario } from '@/lib/scenario';
import { getSession, logEvent, saveSession } from '@/lib/store';

// POST /api/sessions/:id/event { type: 'pack_open', section } | { type: 'draft', text }
// pack_open returns { ok, body, remaining }. The three evidence sources share a budget, enforced here:
// re-opening is free; a new source beyond the budget gets 409 { error: 'budget', remaining: 0 }.
export const POST = withSession(async ({ id }, req) => {
  const body = (await req.json()) as { type?: string; section?: string; text?: string };
  const s = getSession(id)!;
  requireState(s.state, 'work');
  if (body.type === 'pack_open') {
    const section = body.section ?? '';
    if (!scenario.pack.some((p) => p.id === section)) return fail(400, 'Unknown section');
    const budget = scenario.budget[s.mode];
    const opened = openedEvidence(s.data.opens);
    if (isEvidence(section) && !opened.includes(section) && opened.length >= budget) {
      logEvent(s.id, 'budget_block', { section });
      return json({ error: 'budget', remaining: 0 }, 409);
    }
    s.data.opens.push({ section, ts: Date.now() });
    saveSession(s);
    logEvent(s.id, 'pack_open', { section });
    const remaining = Math.max(0, budget - openedEvidence(s.data.opens).length);
    return json({ ok: true, body: isEvidence(section) ? evidenceBody(section) : null, remaining });
  }
  if (body.type === 'draft') {
    if (typeof body.text !== 'string' || body.text.length > 6000) return fail(400, 'text must be a string under 6000 characters');
    s.data.brief = body.text;
    saveSession(s);
    logEvent(s.id, 'draft_snapshot', { length: body.text.length, text: body.text });
    return json({ ok: true });
  }
  return fail(400, 'Unknown event type');
});
