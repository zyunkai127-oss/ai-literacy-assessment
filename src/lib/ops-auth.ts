// Separate teacher access: aggregate operations remain public, individual review evidence does not.
import { createHmac, timingSafeEqual } from 'node:crypto';
const equal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const key = () => process.env.OPS_REVIEW_KEY?.trim() ?? '';
const sign = (expires: string) => createHmac('sha256', key()).update(`teacher-review:${expires}`).digest('hex');
export function correctReviewKey(value: unknown): boolean {
  return !!key() && typeof value === 'string' && value.length <= 200 && equal(value, key());
}
export function reviewerCookie(secure: boolean): string {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  return `alc-review=${expires}.${sign(expires)}; HttpOnly; SameSite=Strict; Path=/api/ops; Max-Age=28800${secure ? '; Secure' : ''}`;
}
export function reviewAuthorized(req: Request): boolean {
  if (!key()) return false;
  const cookie = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('alc-review='))?.slice(11);
  const [expires, signature] = cookie?.split('.') ?? [];
  return !!expires && !!signature && /^\d+$/.test(expires) && Number(expires) > Date.now() && equal(signature, sign(expires));
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const external = new URL(req.url);
  external.host = req.headers.get('host') ?? external.host;
  return origin === external.origin;
}
