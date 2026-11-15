import { describe, expect, it } from 'vitest';
import { runAdaptive, resolveAdaptiveReview } from './adaptive-runner';
import { startAdaptive, submitAdaptiveAnswer } from './adaptive';
import { scoreCollaboration } from './collaboration';
import type { AdaptiveFlow, Result } from './types';
import { scenario } from './scenario';
import type { AdaptiveAgents } from './adaptive-runner';
const result = { collaboration: [], quality: { met: true } } as unknown as Result;
function agents(outcome: 'met' | 'not_met' | 'unclear' = 'met'): AdaptiveAgents {
  return {
    observe: async (f) => ({ outcome, signal: outcome === 'met' ? 'accurate' : outcome === 'not_met' ? 'misconception' : 'ambiguous', evidence: f.turns.at(-1)!.answer! }),
    plan: async f => ({ action: 'ask', questionId: f.turns.length ? 'uncertainty-specific' : 'uncertainty-start', reason: 'probe' }),
    verify: async () => ({ observation: true, action: true, reason: 'aligned' }),
  };
}
const run = (f: AdaptiveFlow, a = agents()) => runAdaptive(f, a, () => {});
describe('adaptive agent coordination', () => {
  it('runs a verified first question then adapts support to the answer', async () => {
    const f = startAdaptive(result); await run(f, agents('not_met'));
    expect(f.status).toBe('asking'); submitAdaptiveAnswer(f, 1, 'The gap proves causation.');
    await run(f, agents('not_met'));
    expect(f.turns[1].support).toBe('specific'); expect(f.turns[0].verified).toBe(true);
    expect(f.core).toEqual(result);
  });
  it('ends after two clear answers and pauses for two-round ambiguity', async () => {
    for (const outcome of ['met', 'unclear'] as const) {
      const f = startAdaptive(result); const a = agents(outcome);
      await run(f, a); submitAdaptiveAnswer(f, 1, 'Synthetic response'); await run(f, a);
      submitAdaptiveAnswer(f, 2, 'Second response'); await run(f, a);
      expect(f.status).toBe(outcome === 'met' ? 'complete' : 'review');
    }
  });
  it('interrupts on a substantive observer/verifier disagreement and resumes only after human guidance', async () => {
    const f = startAdaptive(result); await run(f); submitAdaptiveAnswer(f, 1, 'Synthetic response');
    const a = agents(); a.verify = async () => ({ observation: false, action: true, reason: 'evidence_conflict' });
    await run(f, a); expect(f.status).toBe('review');
    expect(() => submitAdaptiveAnswer(f, 2, 'Should not run')).toThrow();
    resolveAdaptiveReview(f, { action: 'ask', questionId: 'uncertainty-general', outcome: 'unclear' });
    expect(f.status).toBe('asking'); expect(f.turns[0].human).toBe(true); expect(f.turns).toHaveLength(2);
  });
  it('retries rejected plans once, then persists a human-review checkpoint', async () => {
    const f = startAdaptive(result); const a = agents(); let attempts = 0;
    a.plan = async () => { attempts++; return { action: 'ask', questionId: 'made-up', reason: 'probe' }; };
    const checkpoints: string[] = []; await runAdaptive(f, a, () => { checkpoints.push(f.status); });
    expect(attempts).toBe(2); expect(f.status).toBe('review'); expect(checkpoints.at(-1)).toBe('review');
  });
  it('reports provider failures as unavailable and can resume without losing a submitted answer', async () => {
    const f = startAdaptive(result); await run(f); submitAdaptiveAnswer(f, 1, 'Saved answer');
    const a = agents(); a.observe = async () => { throw Error('private provider detail'); };
    await run(f, a); expect(f.status).toBe('unavailable'); expect(f.turns[0].answer).toBe('Saved answer');
    await run(f); expect(f.status).toBe('asking');
    expect(JSON.stringify(f.trace)).not.toContain('private provider detail');
  });
  it('requires a human review checkpoint before accepting any override', () => {
    expect(() => resolveAdaptiveReview(startAdaptive(result), { action: 'finish', questionId: '', outcome: 'met' })).toThrow();
  });
});
