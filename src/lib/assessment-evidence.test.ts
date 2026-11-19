import { describe, expect, it } from 'vitest';
import { validateEvidence } from './assessment-evidence';
import { provisionalScore } from './assessment-scoring';
import { newAssessment } from './secondary';

const draft = 'A dramatic discovery hides years of careful work.';
const firstDraftQuote = 'People remember an apple falling because it is funny.';
const chatDecision = 'I kept the example because it shows how stories spread.';
const essay = 'I kept this example because it shows how stories spread.';
const recommendation = 'I recommend Bristol because the wind was steadier.';
const check = 'I checked the station log against the graph.';
const constraint = 'Please focus on the school budget and one alternative.';
const data = {
  ...newAssessment(), draft: draft + '\n' + firstDraftQuote, revision: draft + '\n' + essay, science: recommendation,
  discussion: [
    { role: 'assistant' as const, text: 'I invented this source.', ts: 0 },
    { role: 'user' as const, text: chatDecision, ts: 1 },
  ],
  comparison: [{ role: 'user' as const, text: check + '\n' + constraint, ts: 0 }],
};

const gap = (task: string) => ({ task, sourceId: null, quote: null, outcome: 'insufficient', reason: 'No example was observed.', improvement: 'Explain your decision.' });
const item = (task: string, sourceId: string, quote: string, outcome = 'met', firstDraftQuote?: string) =>
  ({ task, sourceId, quote, outcome, firstDraftQuote, reason: 'This explains your reasoning.', improvement: 'Name one source.', inventedPoints: 99 });
const results = () => ({
  effective: [item('essay', 'revision', draft), item('science', 'science', recommendation)],
  critical: [item('essay', 'revision', essay, 'partial', firstDraftQuote), gap('science')],
  responsible: [gap('essay'), item('science', 'science-chat-1', check, 'missed')],
  bonus: [gap('essay'), item('science', 'science-chat-1', constraint)],
});

describe('provisional assessment scoring', () => {
  it('averages the three observed dimensions and applies the bonus once', () => {
    const feedback = validateEvidence(data, results());
    expect(provisionalScore(feedback)).toEqual({
      levels: { effective: 'Great', critical: 'Fair', responsible: 'Need Work', bonus: 'Great' },
      assessed: 3, total: 65, bonusApplied: 5,
    });
    expect(feedback.evidence.responsible[1]).toMatchObject({ quote: check, source: 'chat', sourceLabel: 'Chat · Message 1' });
    expect(feedback.evidence.effective[0]).not.toHaveProperty('inventedPoints');
  });

  it('averages only observed dimensions, enforces minimum coverage and caps at 100', () => {
    const raw = results();
    raw.responsible = [gap('essay'), gap('science')];
    expect(provisionalScore(validateEvidence(data, raw))).toMatchObject({ assessed: 2, total: 85 });
    raw.critical[0] = item('essay', 'essay-chat-2', chatDecision);
    expect(provisionalScore(validateEvidence(data, raw))).toMatchObject({ assessed: 2, total: 100, bonusApplied: 0 });
    raw.critical[0] = gap('essay');
    expect(provisionalScore(validateEvidence(data, raw))).toMatchObject({ assessed: 1, total: null, bonusApplied: 0 });
  });

  it('rejects assistant, fabricated and wrong-source quotes, and prevents duplicate or overlapping evidence', () => {
    const raw = results();
    raw.critical = [item('essay', 'draft', draft), item('essay', 'revision', 'years of careful work.'), gap('science')];
    raw.responsible = [item('essay', 'essay-chat-1', 'I invented this source.'), item('science', 'science', check)];
    raw.bonus = [item('essay', 'draft', 'made-up quotation'), item('science', 'revision', essay)];
    const feedback = validateEvidence(data, raw);
    for (const dimension of ['critical', 'responsible', 'bonus'] as const) {
      expect(feedback.evidence[dimension].every(entry => entry.quote === null && entry.outcome === 'insufficient')).toBe(true);
    }
    expect(provisionalScore(feedback)).toMatchObject({ assessed: 1, total: null });
  });

  it('rejects partially overlapping passages reused from different versions of the essay', () => {
    const raw = results();
    raw.effective[0] = item('essay', 'revision', 'A dramatic discovery hides years');
    raw.critical[0] = item('essay', 'revision', essay, 'met', 'discovery hides years of careful work.');
    expect(provisionalScore(validateEvidence(data, raw)).levels.critical).toBe('Not enough evidence');
  });

  it('verifies both drafts, counts the pair once and rejects reuse of either passage', () => {
    const raw = results();
    raw.responsible[0] = item('essay', 'draft', firstDraftQuote);
    raw.bonus[0] = item('essay', 'revision', essay);
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.critical[0]).toMatchObject({ firstDraftQuote, quote: essay });
    expect(feedback.evidence.critical.filter(entry => entry.outcome !== 'insufficient')).toHaveLength(1);
    expect(feedback.evidence.responsible[0].outcome).toBe('insufficient');
    expect(feedback.evidence.bonus[0].outcome).toBe('insufficient');

    raw.critical[0] = item('essay', 'revision', essay, 'met', 'Plausible but fabricated first draft.');
    expect(provisionalScore(validateEvidence(data, raw)).levels.critical).toBe('Not enough evidence');
  });

  it('treats mixed rubric outcomes as Fair without weighting repeated praise by count', () => {
    const raw = results();
    raw.effective[1] = item('science', 'science', recommendation, 'missed');
    expect(provisionalScore(validateEvidence(data, raw)).levels.effective).toBe('Fair');
  });

  it('rejects incomplete rubric results', () => {
    expect(() => validateEvidence(data, { effective: [] })).toThrow('Invalid dimension results');
  });
});
