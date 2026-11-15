import Anthropic from '@anthropic-ai/sdk';
import { fail, json } from '@/lib/api';
import { reviewAuthorized, sameOrigin } from '@/lib/ops-auth';
import { ADAPTIVE_FIXTURES } from '@/lib/adaptive-fixtures';
import { createAdaptiveAgents } from '@/lib/adaptive-agents';
import { QUESTIONS } from '@/lib/adaptive';
import { scenario } from '@/lib/scenario';
import { logEvent } from '@/lib/store';
import type { AdaptiveFlow, Result, AgentTrace } from '@/lib/types';
export function GET(req: Request) {
  if (!reviewAuthorized(req)) return fail(401, 'Teacher access is required.');
  return json({ fixtures: ADAPTIVE_FIXTURES.map(({ id, name, expected }) => ({ id, name, expected })), notice: 'Provisional expected labels. This benchmark is not a validated measure of student ability.' });
}
export async function POST(req: Request) {
  if (!sameOrigin(req) || !reviewAuthorized(req)) return fail(403, 'Teacher access is required.');
  let body;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body'); }
  const fixture = ADAPTIVE_FIXTURES.find(f => f.id === body?.caseId);
  if (!fixture) return fail(400, 'Unknown benchmark case');
  const q = QUESTIONS[fixture.questionId];
  // Ephemeral synthetic evidence only: no real session is created or modified.
  const flow: AdaptiveFlow = { status: 'preparing', core: {} as Result, turns: [{ id: 1, questionId: fixture.questionId, target: q.target, support: q.support, answer: fixture.answer }], trace: [], candidate: { action: 'finish', questionId: '', reason: 'sufficient' } };
  const agents = createAdaptiveAgents(scenario, '');
  const invoke = async <T>(role: AgentTrace['role'], fn: () => Promise<T>) => {
    const trace: AgentTrace = { role, event: 'benchmark', round: 1, ms: 0, inputTokens: 0, outputTokens: 0, ts: Date.now() };
    flow.trace.push(trace);
    try { return await fn(); } finally { trace.ms = Date.now() - trace.ts; }
  };
  try {
    const observed = await invoke('observer', () => agents.observe(flow)); flow.turns[0].observation = observed;
    const verified = await invoke('verifier', () => agents.verify(flow));
    const outcome = { caseId: fixture.id, expected: fixture.expected, observed: observed.outcome,
      matched: observed.outcome === fixture.expected, verified: verified.observation,
      latencyMs: flow.trace.reduce((n, t) => n+t.ms, 0), tokens: flow.trace.reduce((n,t) => n+t.inputTokens+t.outputTokens, 0) };
    logEvent('benchmark', 'adaptive_evaluation', outcome);
    return json(outcome);
  } catch (error) {
    const errorCode = error instanceof Anthropic.APIError ? `provider_${error.status ?? 'network'}` : error instanceof Error && error.message === 'Invalid observation evidence' ? 'invalid_evidence' : error instanceof Error && error.message === 'Incomplete agent response' ? 'incomplete_response' : 'unexpected_failure';
    logEvent('benchmark', 'adaptive_evaluation', { caseId: fixture.id, unavailable: true, errorCode });
    console.warn('Adaptive benchmark unavailable', { caseId: fixture.id, errorCode });
    return json({ caseId: fixture.id, error: 'Benchmark unavailable; no judgement recorded.', errorCode }, 503);
  }
}
