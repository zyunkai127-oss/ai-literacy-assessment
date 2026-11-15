import { acceptAction } from './adaptive';
import type { AdaptiveAction, AdaptiveFlow, FollowUpObservation, FollowUpOutcome, AgentTrace } from './types';

export interface AdaptiveAgents {
  observe(flow: AdaptiveFlow): Promise<FollowUpObservation>;
  plan(flow: AdaptiveFlow): Promise<AdaptiveAction>;
  verify(flow: AdaptiveFlow): Promise<{ observation: boolean; action: boolean; reason: string }>;
}

/** Each role has its own call and checkpoint; failures keep the submitted answer recoverable. */
export async function runAdaptive(flow: AdaptiveFlow, agents: AdaptiveAgents, checkpoint: () => void) {
  if (!['preparing', 'unavailable'].includes(flow.status)) return;
  flow.status = 'preparing'; checkpoint();
  const invoke = async <T>(role: AgentTrace['role'], fn: () => Promise<T>): Promise<T> => {
    const trace: AgentTrace = { role, event: 'started', round: flow.turns.length, ms: 0, inputTokens: 0, outputTokens: 0, ts: Date.now() };
    flow.trace.push(trace); checkpoint();
    try { const result = await fn(); trace.event = 'completed'; return result; }
    catch { trace.event = 'unavailable'; throw new Error('Agent unavailable'); }
    finally { trace.ms = Date.now() - trace.ts; checkpoint(); }
  };
  try {
    const last = flow.turns.at(-1);
    if (last?.answer && !last.observation) {
      last.observation = await invoke('observer', () => agents.observe(flow)); checkpoint();
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      flow.candidate = flow.turns.length >= 2
        ? { action: 'finish', questionId: '', reason: 'sufficient' }
        : await invoke('planner', () => agents.plan(flow));
      try { acceptAction(structuredClone(flow), flow.candidate); }
      catch { flow.trace.at(-1)!.event = 'invalid_plan'; checkpoint(); continue; }
      checkpoint();
      const check = await invoke('verifier', () => agents.verify(flow));
      flow.trace.at(-1)!.event = check.observation && check.action ? 'verified' : check.reason;
      if (!check.observation) {
        flow.status = 'review'; flow.reviewReason = 'The observer and verifier disagree about the answer evidence.'; checkpoint(); return;
      }
      if (!check.action) { checkpoint(); continue; }
      if (last?.observation) last.verified = true;
      if (flow.turns.length >= 2 && last?.observation?.outcome === 'unclear') {
        flow.status = 'review'; flow.reviewReason = 'The answer remains ambiguous after two questions.';
      } else acceptAction(flow, flow.candidate);
      checkpoint(); return;
    }
    flow.status = 'review'; flow.reviewReason = 'A proposed next step could not be verified after two attempts.';
  } catch {
    flow.status = 'unavailable'; flow.reviewReason = 'An AI service call failed. Your submitted answers are saved; retry or finish without further judgement.';
  }
  checkpoint();
}

export function resolveAdaptiveReview(flow: AdaptiveFlow, decision: { action: 'ask' | 'finish'; questionId: string; outcome: FollowUpOutcome }) {
  if (flow.status !== 'review') throw new Error('No pending human review');
  if (!['met', 'not_met', 'unclear'].includes(decision.outcome)) throw new Error('Invalid human judgement');
  const last = flow.turns.at(-1);
  // Validate the proposed action before applying any override.
  if (decision.action === 'ask') acceptAction(structuredClone(flow), { ...decision, reason: 'probe' });
  else if (decision.action !== 'finish') throw new Error('Invalid human action');
  if (last?.answer) {
    last.observation = { outcome: decision.outcome, signal: decision.outcome === 'met' ? 'accurate' : decision.outcome === 'not_met' ? 'partial' : 'ambiguous', evidence: '' };
    last.verified = true; last.human = true;
  }
  flow.trace.push({ role: 'human', event: decision.action === 'ask' ? `resume:${decision.questionId}` : 'finish', round: flow.turns.length, ms: 0, inputTokens: 0, outputTokens: 0, ts: Date.now() });
  delete flow.reviewReason;
  if (decision.action === 'finish') flow.status = 'complete';
  else acceptAction(flow, { ...decision, reason: 'probe' });
}
