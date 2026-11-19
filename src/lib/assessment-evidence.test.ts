import { describe, expect, it } from 'vitest';
import { validateEvidence } from './assessment-evidence';
import { provisionalScore, type Verification } from './assessment-scoring';
import { newAssessment } from './secondary';

const draft = 'A dramatic discovery hides years of careful work.';
const firstDraftQuote = 'People remember an apple falling because it is funny.';
const chatDecision = 'I kept the example because it shows how stories spread.';
const essay = 'I kept this example because it shows how stories spread.';
const recommendation = 'I recommend Bristol because the wind was steadier.';
const check = 'I checked the station log. Bristol had 9 readings below five knots.';
const constraint = 'Please focus on the school budget and one alternative.';
const scienceDecision = 'I’m giving more weight to the calm days than to the peak.';
const data = {
  ...newAssessment(), draft: draft + '\n' + firstDraftQuote, revision: draft + '\n' + essay, science: recommendation,
  discussion: [
    { role: 'assistant' as const, text: 'I invented this source.', ts: 0 },
    { role: 'user' as const, text: chatDecision, ts: 1 },
  ],
  comparison: [{ role: 'user' as const, text: [check, constraint, scienceDecision].join('\n'), ts: 0 }],
};

const gap = (task: string) => ({ task, sourceId: null, quote: null, outcome: 'insufficient', reason: 'No example was observed.', improvement: 'Explain your decision.', verification: null });
const item = (task: string, sourceId: string, quote: string, outcome = 'met', firstDraftQuote?: string) =>
  ({ task, sourceId, quote, outcome, firstDraftQuote, reason: 'This explains your reasoning.', improvement: 'Name one source.', verification: null as Verification | null, inventedPoints: 99 });
const verified = (outcome: string): ReturnType<typeof item> => ({
  ...item('science', 'science-chat-1', check, outcome),
  verification: { kind: 'student_initiated', material: 'station log', reminder: null },
});
const results = () => ({
  effective: [item('essay', 'revision', draft), item('science', 'science', recommendation)],
  critical: [item('essay', 'revision', essay, 'partial', firstDraftQuote), gap('science')],
  responsible: [gap('essay'), verified('missed')],
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

  it('uses overlapping essay passages once, with priority for the draft comparison', () => {
    const raw = results();
    raw.effective[0] = item('essay', 'revision', 'A dramatic discovery hides years');
    raw.critical[0] = item('essay', 'revision', essay, 'met', 'discovery hides years of careful work.');
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.critical[0]).toMatchObject({ firstDraftQuote: 'discovery hides years of careful work.' });
    expect(feedback.evidence.effective[0]).toMatchObject({ task: 'essay', outcome: 'insufficient' });
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

  it('distinguishes the strong and weak QA cases with the same evidence coverage', () => {
    const strong = results();
    strong.critical = [
      item('essay', 'revision', essay, 'met', firstDraftQuote),
      item('science', 'science-chat-1', scienceDecision, 'partial'),
    ];
    strong.responsible[1] = verified('met');
    const strongScore = provisionalScore(validateEvidence(data, strong));
    expect(strongScore.levels.critical).toBe('Fair');
    expect(strongScore.assessed).toBe(3);
    expect(strongScore.total).toBeCloseTo(91.6667);

    const weak = results();
    weak.effective = weak.effective.map(entry => ({ ...entry, outcome: 'missed' }));
    weak.critical[1] = item('science', 'science-chat-1', scienceDecision, 'missed');
    weak.bonus[1] = gap('science');
    const weakScore = provisionalScore(validateEvidence(data, weak));
    expect(weakScore.levels.critical).toBe('Need Work');
    expect(weakScore.assessed).toBe(3);
    expect(weakScore.total).toBe(20);
  });

  it('does not use a separate automatic deduction for a correctly stated voltage caveat', () => {
    const caveat = 'The windmill produced 2.386 volts in one test. That alone does not show it can power the school.';
    const submission = { ...data, science: recommendation + ' ' + caveat };
    const raw = { ...results(), unsupportedVoltageInference: caveat };
    raw.effective.push(item('science', 'science', caveat));
    const feedback = validateEvidence(submission, raw);
    expect(provisionalScore(feedback).levels.effective).toBe('Great');
    expect(feedback.evidence.effective.find(entry => entry.quote === caveat)?.outcome).toBe('met');
  });

  it('keeps an endorsed unsupported voltage conclusion in the ordinary science result', () => {
    const claim = 'The windmill produced 2.386 volts in one test, which means a turbine can power the school.';
    const submission = { ...data, science: recommendation + ' ' + claim };
    const raw = results();
    raw.effective.push(item('science', 'science', claim, 'missed'));
    const feedback = validateEvidence(submission, raw);
    expect(feedback.evidence.effective.find(entry => entry.quote === claim)?.outcome).toBe('missed');
    expect(provisionalScore(feedback).levels.effective).toBe('Fair');
  });

  it('uses a chat citation only to report what happened in the discussion', () => {
    const raw = results();
    raw.critical[0] = { ...item('essay', 'essay-chat-2', chatDecision), reason: 'Your revised essay kept the laziness claim.' };
    const result = validateEvidence(data, raw).evidence.critical[0];
    expect(result.quote).toBe(chatDecision);
    expect(result.reason).not.toContain('kept the laziness claim');
    expect(result.firstDraftQuote).toBeUndefined();
  });

  it('reports one supported Humanities decision even if the model supplies two', () => {
    const raw = results();
    raw.critical.splice(1, 0, item('essay', 'essay-chat-2', chatDecision));
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.critical.filter(entry => entry.task === 'essay')).toMatchObject([
      { quote: essay, firstDraftQuote },
    ]);
  });

  it('records consultation with AI without counting it as a student source check', () => {
    const quote = 'I asked the AI to check the claim and used the result.';
    const aiReliance = {
      ...item('science', 'science', quote),
      verification: { kind: 'ai_reliance', material: null, reminder: null },
    };
    const raw = { ...results(), responsible: [gap('essay'), aiReliance] };
    const feedback = validateEvidence({ ...data, science: recommendation + ' ' + quote }, raw);
    expect(feedback.evidence.responsible[1]).toMatchObject({
      quote, outcome: 'insufficient', verification: { kind: 'ai_reliance' },
    });
    expect(provisionalScore(feedback).levels.responsible).toBe('Not enough evidence');
  });

  it('requires a real earlier assistant reminder for prompted verification', () => {
    const reminder = 'Check this reading in the station log yourself.';
    const comparison = [
      { role: 'assistant' as const, text: reminder, ts: 0 },
      { role: 'user' as const, text: check, ts: 1 },
    ];
    const prompted = {
      ...item('science', 'science-chat-2', check),
      verification: { kind: 'after_ai_reminder', material: 'station log', reminder: { message: 1, quote: reminder } },
    };
    const raw = { ...results(), responsible: [gap('essay'), prompted] };
    expect(validateEvidence({ ...data, comparison }, raw).evidence.responsible[1]).toMatchObject({
      quote: check, outcome: 'met', verification: { kind: 'after_ai_reminder' },
    });
    prompted.verification.reminder.quote = 'Invented reminder.';
    expect(validateEvidence({ ...data, comparison }, raw).evidence.responsible[1]).toMatchObject({
      quote: check, outcome: 'met', verification: { kind: 'unclear_initiator', reminder: null },
    });
  });

  it('uses the student’s source wording when the assessor names its windmill test section', () => {
    const quote = 'I checked those rows in the notebook.';
    const check = {
      ...item('science', 'science', quote),
      verification: { kind: 'unclear_initiator', material: 'Windmill test record', reminder: null },
    };
    const raw = { ...results(), responsible: [gap('essay'), check] };
    expect(validateEvidence({ ...data, science: recommendation + ' ' + quote }, raw).evidence.responsible[1]).toMatchObject({
      quote, outcome: 'met', verification: { kind: 'unclear_initiator', material: 'notebook' },
    });
  });

  it('keeps supported feedback when one task has no observations', () => {
    const raw = { ...results(), responsible: [verified('met')] };
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.responsible).toMatchObject([
      { task: 'essay', outcome: 'insufficient' },
      { task: 'science', quote: check, outcome: 'met' },
    ]);
  });

  it('rejects incomplete rubric results', () => {
    expect(() => validateEvidence(data, { effective: [] })).toThrow('Invalid dimension results');
  });
});
