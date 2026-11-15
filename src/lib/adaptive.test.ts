import { describe, expect, it } from 'vitest';
import { acceptAction, finishAdaptive, startAdaptive, submitAdaptiveAnswer, publicAdaptive, QUESTIONS } from './adaptive';
import { scoreCollaboration } from './collaboration';
import { scenario } from './scenario';
import type { Observations } from './types';
const observation: Observations = { mode: 'full', brief: '', firstInstruction: '', assistantReplies: [], studentMessages: [], draftShown: false, flagged: [], leastSure: [], queried: [], queriedAt: {}, openedAt: {}, confidence: .5, declared: 'MINE', namesToAI: [], ghostRequested: false, p2Shown: false, p2Accepted: false, onTime: true, quoteText: false };
const core = () => scoreCollaboration(scenario, observation);
const ask = (questionId = 'uncertainty-start') => ({ action: 'ask' as const, questionId, reason: 'probe' as const });
describe('adaptive follow-up boundaries', () => {
  it('freezes the core result before adaptive support is given', () => {
    const source = core(); const flow = startAdaptive(source);
    source.quality.met = true;
    expect(flow.core.quality.met).toBe(false);
    expect(finishAdaptive(flow).quality).toEqual(flow.core.quality);
  });
  it('requires an unhinted first question and rejects unknown or hinted starts', () => {
    expect(() => acceptAction(startAdaptive(core()), ask('made-up'))).toThrow();
    expect(() => acceptAction(startAdaptive(core()), ask('uncertainty-general'))).toThrow();
    expect(acceptAction(startAdaptive(core()), ask()).turns[0].support).toBe('none');
  });
  it('accepts each answer once, preserving question identity and order', () => {
    const flow = acceptAction(startAdaptive(core()), ask());
    expect(() => submitAdaptiveAnswer(flow, 2, 'Answer')).toThrow();
    submitAdaptiveAnswer(flow, 1, 'Answer');
    expect(() => submitAdaptiveAnswer(flow, 1, 'Replacement')).toThrow();
    expect(flow.turns[0].answer).toBe('Answer');
  });
  it('limits the activity to two questions and never repeats a question', () => {
    const f = acceptAction(startAdaptive(core()), ask());
    submitAdaptiveAnswer(f, 1, 'First');
    expect(() => acceptAction(f, ask())).toThrow();
    acceptAction(f, ask('uncertainty-general')); submitAdaptiveAnswer(f, 2, 'Second');
    expect(() => acceptAction(f, ask('uncertainty-specific'))).toThrow();
  });
  it('keeps support conditions and evidence IDs but no answer quotations in final feedback', () => {
    const f = acceptAction(startAdaptive(core()), ask());
    submitAdaptiveAnswer(f, 1, 'private synthetic answer');
    f.turns[0].observation = { outcome: 'met', signal: 'accurate', evidence: 'private synthetic answer' }; f.turns[0].verified = true;
    f.status = 'complete';
    const r = finishAdaptive(f);
    expect(r.followUp?.turns[0]).toMatchObject({ id: 1, support: 'none', outcome: 'met', reviewed: 'automatic' });
    expect(JSON.stringify(r)).not.toContain('private synthetic answer');
  });
  it('makes the source pack available without exposing judgement rubrics or private observer evidence', () => {
    const f = acceptAction(startAdaptive(core()), ask());
    f.turns[0].observation = { outcome: 'unclear', signal: 'ambiguous', evidence: 'PRIVATE_OBSERVER_EVIDENCE' };
    const view = publicAdaptive(f, scenario);
    expect(view.sources).toHaveLength(scenario.pack.length);
    expect(view.question).toBe(QUESTIONS['uncertainty-start'].text);
    expect(JSON.stringify(view)).not.toContain('criterion');
    expect(JSON.stringify(view)).not.toContain('PRIVATE_OBSERVER_EVIDENCE');
    expect(JSON.stringify(view.sources)).not.toContain('Priya Raman');
  });
  it('does not turn unverified observations into measured outcomes', () => {
    const f = acceptAction(startAdaptive(core()), ask()); f.turns[0].observation = { outcome: 'met', signal: 'accurate', evidence: 'yes' };
    expect(finishAdaptive(f).followUp?.turns[0].outcome).toBe('unclear');
    expect(Object.values(QUESTIONS).every(q => q.text && q.criterion)).toBe(true);
  });
});
