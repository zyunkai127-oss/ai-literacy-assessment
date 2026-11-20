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
