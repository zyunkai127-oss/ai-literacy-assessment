import { newAssessment } from '@/lib/secondary';
import { insertAssessment } from '@/lib/store';
import { fail, json } from '@/lib/api';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.understood !== true) return fail(400, 'Please read the activity information first.');
  return json({ id: insertAssessment(newAssessment()) }, 201);
}
