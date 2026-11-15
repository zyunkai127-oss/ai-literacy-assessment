import { fail, json } from '@/lib/api';
import { createSession } from '@/lib/store';

// POST /api/sessions { mode: 'judge'|'full', understood: true, store: boolean } -> { id }
export async function POST(req: Request) {
  let body: { mode?: string; understood?: boolean; store?: boolean };
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body'); }
  if (body.mode !== 'judge' && body.mode !== 'full') return fail(400, 'mode must be "judge" or "full"');
  if (body.understood !== true) return fail(400, 'You need to confirm you understand the AI may be wrong');
  const s = createSession(body.mode, body.store === true);
  return json({ id: s.id }, 201);
}
