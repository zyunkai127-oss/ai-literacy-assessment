import { afterEach, expect, it, vi } from 'vitest';
import { reviewAuthorized, reviewerCookie, correctReviewKey, sameOrigin } from './ops-auth';
afterEach(() => vi.unstubAllEnvs());
it('requires a configured key and a valid HttpOnly reviewer session', () => {
  vi.stubEnv('OPS_REVIEW_KEY', 'review-fixture-secret');
  expect(correctReviewKey('wrong')).toBe(false);
  expect(correctReviewKey('é'.repeat('review-fixture-secret'.length))).toBe(false);
  expect(correctReviewKey('review-fixture-secret')).toBe(true);
  expect(reviewAuthorized(new Request('http://127.0.0.1/api/ops/reviews'))).toBe(false);
  const cookie = reviewerCookie(false);
  expect(cookie).toContain('HttpOnly'); expect(cookie).not.toContain('review-fixture-secret');
  expect(reviewAuthorized(new Request('http://127.0.0.1/api/ops/reviews', { headers: { cookie } }))).toBe(true);
  vi.stubEnv('OPS_REVIEW_KEY', '');
  expect(correctReviewKey('')).toBe(false);
  expect(reviewAuthorized(new Request('http://127.0.0.1/api/ops/reviews', { headers: { cookie } }))).toBe(false);
});
it('rejects cross-origin teacher mutations', () => {
  expect(sameOrigin(new Request('http://127.0.0.1/api/ops/reviews', { headers: { origin: 'https://untrusted.example' } }))).toBe(false);
  expect(sameOrigin(new Request('http://127.0.0.1/api/ops/reviews', { headers: { origin: 'http://127.0.0.1' } }))).toBe(true);
});
it('accepts the browser host when Next.js exposes an internal localhost URL', () => {
  expect(sameOrigin(new Request('http://localhost:3000/api/ops/access', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }))).toBe(true);
});
