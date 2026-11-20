import { createHash, randomBytes } from 'node:crypto';

const cookieName = 'alc-assessment';
const maxAgeSeconds = 30 * 24 * 60 * 60;
export type AssessmentOwner = { digest: string; expiresAt: number };
const loopback = ['localhost', '127.0.0.1', '[::1]'];

export function assessmentOwnerDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function issueAssessmentAccess(req: Request) {
  const token = randomBytes(32).toString('base64url');
  const { protocol, hostname } = new URL(req.url);
  const secure = protocol === 'http:' && loopback.includes(hostname) ? '' : '; Secure';
  return {
    owner: { digest: assessmentOwnerDigest(token), expiresAt: Date.now() + maxAgeSeconds * 1000 } satisfies AssessmentOwner,
    cookie(id: string) {
      return `${cookieName}=${token}; Path=/api/assessment/${id}; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
    },
  };
}

export function assessmentAccess(req: Request) {
  const matches = (req.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(cookieName + '='));
  const token = matches.length === 1 ? matches[0].slice(cookieName.length + 1) : '';
  return {
    owner: /^[A-Za-z0-9_-]{43}$/.test(token) ? assessmentOwnerDigest(token) : null,
    allowLegacy: process.env.NODE_ENV === 'development' && process.env.ALLOW_LOCAL_LEGACY_ASSESSMENTS === '1'
      && loopback.includes(new URL(req.url).hostname),
  };
}
