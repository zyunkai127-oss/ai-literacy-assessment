import { correctReviewKey, reviewerCookie, sameOrigin } from '@/lib/ops-auth';
import { fail, json } from '@/lib/api';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin review access is not allowed.');
  if (!process.env.OPS_REVIEW_KEY?.trim()) return fail(503, 'Teacher review is not configured. Set OPS_REVIEW_KEY on the server.');
  let body;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body'); }
  if (!correctReviewKey(body?.key)) return fail(401, 'The review key was not accepted.');
  const response = json({ authorized: true });
  response.headers.set('Set-Cookie', reviewerCookie(new URL(req.url).protocol === 'https:'));
  return response;
}
