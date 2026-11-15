// Run with Node 22+, OPS_REVIEW_KEY set, and the local app running.
import { writeFile } from 'node:fs/promises';
const base = process.env.ALC_BASE_URL || 'http://127.0.0.1:3000';
if (!process.env.OPS_REVIEW_KEY) throw new Error('Set OPS_REVIEW_KEY to authenticate this synthetic benchmark.');
const login = await fetch(`${base}/api/ops/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: process.env.OPS_REVIEW_KEY }) });
if (!login.ok) throw new Error(`Teacher authentication failed (${login.status}).`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const response = await fetch(`${base}/api/ops/evaluation`, { headers: { cookie } });
if (!response.ok) throw new Error('Could not load benchmark cases.');
const { fixtures, notice } = await response.json();
console.log(notice);
const results = [];
let consecutiveFailures = 0;
for (const fixture of fixtures) {
  const started = Date.now();
  let result;
  try {
    const res = await fetch(`${base}/api/ops/evaluation`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: fixture.id }), signal: AbortSignal.timeout(45_000) });
    const body = await res.json();
    result = res.ok ? body : { caseId: fixture.id, unavailable: true, errorCode: body.errorCode ?? 'http_failure', elapsedMs: Date.now() - started };
  } catch { result = { caseId: fixture.id, unavailable: true, errorCode: 'request_failed', elapsedMs: Date.now() - started }; }
  results.push(result);
  consecutiveFailures = result.unavailable ? consecutiveFailures + 1 : 0;
  console.log(JSON.stringify({ completed: results.length, total: fixtures.length, matched: results.filter(r => r.matched && r.verified).length, unavailable: results.filter(r => r.unavailable).length }));
  if (consecutiveFailures >= 2) { console.log('Stopped after two consecutive unavailable cases. Remaining cases are not run.'); break; }
}
const available = results.filter(r => !r.unavailable);
const report = { createdAt: new Date().toISOString(), notice, total: fixtures.length, attempted: results.length, notRun: fixtures.length - results.length, available: available.length,
  matched: available.filter(r => r.matched).length, verifiedMatches: available.filter(r => r.matched && r.verified).length,
  disagreements: available.filter(r => !r.verified).length, unavailable: results.length-available.length,
  falsePositiveMet: available.filter(r => r.expected !== 'met' && r.observed === 'met').length,
  falseNegativeMet: available.filter(r => r.expected === 'met' && r.observed !== 'met').length,
  results };
await writeFile('data/adaptive-evaluation-latest.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
