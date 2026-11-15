import { fail, json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { logEvent, saveSession } from '@/lib/store';

// POST /api/sessions/:id/event { type: 'pack_open', section } | { type: 'draft', text }
export const POST = withSession(async (s, req) => {
  requireState(s.state, 'work');
  const body = (await req.json()) as { type?: string; section?: string; text?: string };
  if (body.type === 'pack_open') {
    if (!scenario.pack.some((p) => p.id === body.section)) return fail(400, 'Unknown section');
    s.data.opens.push({ section: body.section!, ts: Date.now() });
    saveSession(s);
    logEvent(s.id, 'pack_open', { section: body.section });
    return json({ ok: true });
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
