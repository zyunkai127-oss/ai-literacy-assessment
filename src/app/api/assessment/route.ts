import { issueAssessmentAccess } from '@/lib/assessment-access';
import { newAssessment } from '@/lib/secondary';
import { insertAssessment } from '@/lib/store';
import { fail, json } from '@/lib/api';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.understood !== true) return fail(400, 'Please read the activity information first.');
  const access = issueAssessmentAccess(req);
  const id = insertAssessment(newAssessment(), access.owner);
  const response = json({ id }, 201);
  response.headers.set('Set-Cookie', access.cookie(id));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
