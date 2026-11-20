// Beta distribution helpers for small-sample evidence summaries. Server and client safe.

/** log Γ(x) by the Lanczos approximation (g = 7, n = 9), accurate to about 15 digits for x > 0. */
function logGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let sum = c[0];
  for (let i = 1; i < 9; i++) sum += c[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  d = 1 / (Math.abs(d) < tiny ? tiny : d);
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    for (const term of [m * (b - m) * x / ((a + m2 - 1) * (a + m2)), -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))]) {
      d = 1 + term * d; d = 1 / (Math.abs(d) < tiny ? tiny : d);
      c = 1 + term / c; if (Math.abs(c) < tiny) c = tiny;
      h *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-14) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b): the Beta(a, b) cumulative distribution at x. */
export function betaCdf(x: number, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || Number.isNaN(x)) throw RangeError('Invalid Beta parameters');
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? front * betaContinuedFraction(x, a, b) / a
    : 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}

/** Quantile by 60 bisections, limited by floating-point and CDF accuracy. */
export function betaQuantile(p: number, a: number, b: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) throw RangeError('Invalid Beta parameters');
  if (p === 0 || p === 1) return p;
  let low = 0, high = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (betaCdf(mid, a, b) < p) low = mid; else high = mid;
  }
  return (low + high) / 2;
}
