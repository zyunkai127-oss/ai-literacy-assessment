import { describe, expect, it } from 'vitest';
import { betaCdf, betaQuantile } from './beta';
import { BETA_Q } from './scoring';

describe('beta', () => {
  it('matches the 90% Jeffreys intervals tabulated for the earlier activity', () => {
    for (const [key, [low, high]] of Object.entries(BETA_Q)) {
      const [s, f] = key.split(',').map(Number);
      expect(betaQuantile(0.05, s + 0.5, f + 0.5)).toBeCloseTo(low, 3);
      expect(betaQuantile(0.95, s + 0.5, f + 0.5)).toBeCloseTo(high, 3);
    }
  });

  it('handles fractional successes and the closed form of Beta(1, 1)', () => {
    expect(betaCdf(0.3, 1, 1)).toBeCloseTo(0.3, 12);
    expect(betaQuantile(0.5, 2, 2)).toBeCloseTo(0.5, 12);
    const low = betaQuantile(0.05, 1, 2), high = betaQuantile(0.95, 1, 2);
    expect(betaCdf(high, 1, 2) - betaCdf(low, 1, 2)).toBeCloseTo(0.9, 10);
  });
});


describe('independent analytic interval checks', () => {
  it.each([0.001, 0.05, 0.5, 0.95, 0.999])('matches closed-form quantiles at p=%s', p => {
    expect(betaQuantile(p, 0.5, 0.5)).toBeCloseTo(Math.sin(Math.PI * p / 2) ** 2, 11);
    expect(betaQuantile(p, 1, 1)).toBeCloseTo(p, 12);
    expect(betaQuantile(p, 1, 2)).toBeCloseTo(1 - Math.sqrt(1 - p), 12);
  });

  it('has correct tail mass and symmetry for every possible two-task summary', () => {
    for (let n = 1; n <= 2; n++) for (let s = 0; s <= n; s += 0.5) {
      const a = s + 0.5, b = n - s + 0.5;
      const lo = betaQuantile(0.05, a, b), hi = betaQuantile(0.95, a, b);
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeLessThan(1);
      expect(betaCdf(lo, a, b)).toBeCloseTo(0.05, 10);
      expect(betaCdf(hi, a, b)).toBeCloseTo(0.95, 10);
      expect(lo).toBeCloseTo(1 - betaQuantile(0.95, b, a), 10);
    }
  });

  it('returns exact endpoint quantiles and rejects invalid parameters', () => {
    expect(betaQuantile(0, 0.5, 2.5)).toBe(0);
    expect(betaQuantile(1, 0.5, 2.5)).toBe(1);
    expect(() => betaQuantile(-0.1, 1, 1)).toThrow(RangeError);
    expect(() => betaQuantile(0.5, 0, 1)).toThrow(RangeError);
    expect(() => betaCdf(0.5, NaN, 1)).toThrow(RangeError);
  });
});
