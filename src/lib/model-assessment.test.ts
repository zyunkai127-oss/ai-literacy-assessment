import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAssessment, assessmentInput, assessCollaboration } from './model-assessment';
import { scoreCollaboration } from './collaboration';
import { scenario } from './scenario';
import type { Observations } from './types';

const o: Observations = {
  mode: 'judge', brief: 'The survey report says 56% use AI weekly. The quiz note reports a mean of 27.5.',
  firstInstruction: '', assistantReplies: ['The survey is the source.'], studentMessages: ['Which source supports the figure?'],
  conversation: [{ role: 'user', text: 'Which source supports the figure? private-example', ts: 1 }, { role: 'assistant', text: 'The survey is the source.', ts: 2 }],
  draftShown: false, flagged: [], leastSure: [], queried: [], queriedAt: {}, openedAt: {}, confidence: .5,
  declared: 'MINE', namesToAI: [], ghostRequested: false, p2Shown: false, p2Accepted: false, onTime: true, quoteText: false,
};
const base = () => scoreCollaboration(scenario, o);
const decisions = () => ({ checks: ['direction', 'basis', 'selection', 'uncertainty', 'ownership', 'review'].map((id) => ({ id, status: id === 'basis' ? 'supported' : 'insufficient', messages: id === 'basis' ? [1, 2] : [] })) });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('semantic assessment validation', () => {
  it('accepts valid model evidence without retaining student text', () => {
    const result = applyAssessment(base(), assessmentInput(scenario, o, base()), decisions());
    expect(result.assessment?.status).toBe('complete');
    expect(result.collaboration?.find((c) => c.id === 'basis')?.status).toBe('supported');
    expect(JSON.stringify(result)).not.toContain('private-example');
    expect(result.quality).toEqual(base().quality);
  });
  it('rejects missing, duplicate and invented message references', () => {
    const missing = decisions(); missing.checks.pop();
    expect(() => applyAssessment(base(), assessmentInput(scenario, o, base()), missing)).toThrow();
    const duplicate = decisions(); duplicate.checks[0].id = 'basis';
    expect(() => applyAssessment(base(), assessmentInput(scenario, o, base()), duplicate)).toThrow();
    const invented = decisions(); invented.checks[1].messages = [999];
    expect(() => applyAssessment(base(), assessmentInput(scenario, o, base()), invented)).toThrow();
  });
  it('does not allow the model to bypass request-reply order or deterministic task checks', () => {
    const input = assessmentInput(scenario, o, base());
    const wrongOrder = decisions(); wrongOrder.checks[1].messages = [1];
    expect(applyAssessment(base(), input, wrongOrder).collaboration?.find((c) => c.id === 'basis')?.status).toBe('insufficient');
    const noSources = { ...base(), quality: { ...base().quality, sourced: false } };
    expect(applyAssessment(noSources, input, decisions()).collaboration?.find((c) => c.id === 'basis')?.status).toBe('insufficient');
    const review = decisions(); review.checks[5] = { id: 'review', status: 'supported', messages: [1, 2] };
    expect(applyAssessment(base(), input, review).collaboration?.find((c) => c.id === 'review')?.status).toBe('insufficient');
  });
  it('joins semantic review and selection evidence only when the choice follows the reply', () => {
    const observations = { ...o, conversation: [...o.conversation!, { role: 'user' as const, text: 'I kept the comparison because it is observational.', ts: 3 }] };
    const input = assessmentInput(scenario, observations, base());
    const complete = { ...base(), quality: { ...base().quality, met: true } };
    const raw = decisions();
    raw.checks[2] = { id: 'selection', status: 'supported', messages: [3] };
    raw.checks[5] = { id: 'review', status: 'supported', messages: [1, 2] };
    expect(applyAssessment(complete, input, raw).collaboration?.find((c) => c.id === 'review')?.status).toBe('supported');
    raw.checks[2].messages = [1];
    expect(applyAssessment(complete, input, raw).collaboration?.find((c) => c.id === 'review')?.status).toBe('insufficient');
    raw.checks[2] = { id: 'selection', status: 'insufficient', messages: [3] };
    expect(applyAssessment(complete, input, raw).collaboration?.find((c) => c.id === 'review')?.status).toBe('insufficient');
  });
  it('does not accept an unsupported ownership accusation', () => {
    const raw = decisions(); raw.checks[4] = { id: 'ownership', status: 'practise', messages: [1, 2] };
    expect(applyAssessment(base(), assessmentInput(scenario, o, base()), raw).collaboration?.find((c) => c.id === 'ownership')?.status).toBe('insufficient');
  });
  it('accepts an ownership reflection referencing the assistant wording rather than inventing a student request', () => {
    const raw = decisions(); raw.checks[4] = { id: 'ownership', status: 'practise', messages: [2] };
    const input = { ...assessmentInput(scenario, o, base()), distinctiveOverlapSignal: true };
    expect(applyAssessment(base(), input, raw).collaboration?.find((c) => c.id === 'ownership')?.status).toBe('practise');
  });
  it('never flags accurately disclosed AI contribution as an ownership mismatch', () => {
    const raw = decisions(); raw.checks[4] = { id: 'ownership', status: 'practise', messages: [1, 2] };
    const input = { ...assessmentInput(scenario, o, base()), distinctiveOverlapSignal: true, declared: 'AI' as const };
    expect(applyAssessment(base(), input, raw).collaboration?.find((c) => c.id === 'ownership')?.status).toBe('insufficient');
  });
  it('redacts names in evidence supplied for assessment', () => {
    const input = assessmentInput(scenario, { ...o, brief: 'Priya Raman said this.', conversation: [{ role: 'user', text: 'Priya Raman said this.', ts: 1 }] }, base());
    expect(JSON.stringify(input)).not.toContain('Priya Raman');
  });
  it('parses a successful provider tool response and preserves deterministic task checks', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only'); vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      id: 'assessment-fixture', type: 'message', role: 'assistant', model: 'fixture',
      content: [{ type: 'tool_use', id: 'tool-fixture', name: 'record_assessment', input: decisions() }],
      stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
    })));
    const result = await assessCollaboration(scenario, o);
    expect(result.assessment?.status).toBe('complete');
    expect(result.collaboration?.find((c) => c.id === 'basis')?.status).toBe('supported');
    expect(result.quality).toEqual(base().quality);
  });
  it('shows unavailable feedback on API failure without leaking provider payloads or falling back to keyword judgements', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only'); vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'provider-private-detail' } }, { status: 503 })));
    const result = await assessCollaboration(scenario, o);
    expect(result.assessment?.status).toBe('unavailable');
    expect(result.collaboration?.every((c) => c.status === 'insufficient')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('provider-private-detail');
    expect(result.quality).toEqual(base().quality);
  });
});
