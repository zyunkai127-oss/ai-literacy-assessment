import { describe, expect, it } from 'vitest';
import { consensusEvidence, validateEvidence } from './assessment-evidence';
import { combineLevels, evidenceStrength, provisionalScore, scoringVersion, evidenceVersion, type Verification } from './assessment-scoring';
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
  comparison: [
    { role: 'assistant' as const, text: 'Bristol had 9 readings below five knots in the station log.', ts: 0 },
    { role: 'user' as const, text: [check, constraint, scienceDecision].join('\n'), ts: 1 },
  ],
};

const claim = { message: 1, quote: 'Bristol had 9 readings below five knots in the station log.' };
const gap = (task: string) => ({ task, sourceId: null, quote: null, outcome: 'insufficient', reason: 'No example was observed.', improvement: 'Explain your decision.', verification: null });
const item = (task: string, sourceId: string, quote: string, outcome = 'met', firstDraftQuote?: string) =>
  ({ task, sourceId, quote, outcome, firstDraftQuote, reason: 'This explains your reasoning.', improvement: 'Name one source.', verification: null as Verification | null, inventedPoints: 99 });
const verified = (outcome: string): ReturnType<typeof item> => ({
  ...item('science', 'science-chat-2', check, outcome),
  verification: { kind: 'student_initiated', material: 'station log', reminder: null, claim },
});
const results = () => ({
  effective: [item('essay', 'revision', draft), item('science', 'science', recommendation)],
  critical: [item('essay', 'revision', essay, 'partial', firstDraftQuote), gap('science')],
  responsible: [gap('essay'), verified('missed')],
  bonus: [gap('essay'), item('science', 'science-chat-2', constraint)],
});

describe('provisional assessment scoring', () => {
  it('averages the three observed dimensions and applies the bonus once', () => {
    const feedback = validateEvidence(data, results());
    expect(provisionalScore(feedback)).toMatchObject({
      levels: { effective: 'Great', critical: 'Fair', responsible: 'Need Work', bonus: 'Great' },
      assessed: 3, total: 65, bonusApplied: 5,
    });
    expect(feedback.evidence.responsible[1]).toMatchObject({ quote: check, source: 'chat', sourceLabel: 'Chat · Message 2' });
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

  it('does not let items downgraded to insufficient block a later verified check', () => {
    const reliance = (quote: string) => ({
      ...item('science', 'science-chat-2', quote),
      verification: { kind: 'ai_reliance', material: '', reminder: null, claim } as Verification,
    });
    const raw = { ...results(), responsible: [gap('essay'), reliance(constraint), reliance(scienceDecision), verified('met')] };
    const science = validateEvidence(data, raw).evidence.responsible.filter(entry => entry.task === 'science');
    expect(science.map(entry => entry.outcome)).toEqual(['insufficient', 'insufficient', 'met']);
    expect(science[2]).toMatchObject({ quote: check });
  });

  it('keeps a valid candidate listed after rejected ones and stops at two verified items', () => {
    const raw = results();
    raw.bonus = [
      item('science', 'science-chat-2', 'made-up quotation'),
      item('science', 'science', 'another invented line'),
      item('science', 'science-chat-2', constraint),
      gap('essay'),
    ];
    expect(validateEvidence(data, raw).evidence.bonus.find(entry => entry.task === 'science'))
      .toMatchObject({ quote: constraint, outcome: 'met' });

    raw.effective = [
      item('essay', 'revision', 'not in the essay'),
      item('essay', 'revision', draft),
      item('essay', 'revision', essay),
      item('essay', 'revision', 'A dramatic discovery'),
      item('science', 'science', recommendation),
    ];
    expect(validateEvidence(data, raw).evidence.effective.filter(entry => entry.task === 'essay').map(entry => entry.quote))
      .toEqual([draft, essay]);
  });

  it('evaluates the final essay independently of the draft comparison', () => {
    const raw = results();
    raw.effective[0] = item('essay', 'revision', 'A dramatic discovery hides years');
    raw.critical[0] = item('essay', 'revision', essay, 'met', 'discovery hides years of careful work.');
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.critical[0]).toMatchObject({ firstDraftQuote: 'discovery hides years of careful work.' });
    expect(feedback.evidence.effective[0]).toMatchObject({ task: 'essay', outcome: 'met' });
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
      item('science', 'science-chat-2', scienceDecision, 'partial'),
    ];
    strong.responsible[1] = verified('met');
    const strongScore = provisionalScore(validateEvidence(data, strong));
    expect(strongScore.levels.critical).toBe('Fair');
    expect(strongScore.assessed).toBe(3);
    expect(strongScore.total).toBeCloseTo((100 + 80 + 100) / 3 + 5);

    const weak = results();
    weak.effective = weak.effective.map(entry => ({ ...entry, outcome: 'missed' }));
    weak.critical[1] = item('science', 'science-chat-2', scienceDecision, 'missed');
    weak.bonus[1] = gap('science');
    const weakScore = provisionalScore(validateEvidence(data, weak));
    expect(weakScore.levels.critical).toBe('Need Work');
    expect(weakScore.assessed).toBe(3);
    expect(weakScore.total).toBeCloseTo((20 + 40 + 20) / 3);
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
      { role: 'assistant' as const, text: claim.quote + '\n' + reminder, ts: 0 },
      { role: 'user' as const, text: check, ts: 1 },
    ];
    const prompted = {
      ...item('science', 'science-chat-2', check),
      verification: { kind: 'after_ai_reminder', material: 'station log', reminder: { message: 1, quote: reminder }, claim },
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
      verification: { kind: 'unclear_initiator', material: 'Windmill test record', reminder: null, claim },
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

  it('scores a check after an AI reminder, or with an unclear initiator, as Fair', () => {
    const raw = { ...results(), responsible: [gap('essay'), verified('met')] };
    expect(provisionalScore(validateEvidence(data, raw)).levels.responsible).toBe('Great');
    raw.responsible[1].verification = { kind: 'unclear_initiator', material: 'station log', reminder: null, claim };
    expect(provisionalScore(validateEvidence(data, raw)).levels.responsible).toBe('Fair');
  });

  it('does not score a source check that tests no AI claim', () => {
    const raw = { ...results(), responsible: [gap('essay'), verified('met')] };
    raw.responsible[1].verification = { kind: 'student_initiated', material: 'station log', reminder: null, claim: { message: 1, quote: 'Invented claim.' } };
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.responsible[1]).toMatchObject({ outcome: 'insufficient' });
    expect(provisionalScore(feedback).levels.responsible).toBe('Not enough evidence');
  });

  it('requires an earlier complete AI claim and adoption in the final work to penalise reliance', () => {
    const falseClaim = 'No Bristol readings fell below 5 knots.';
    const endorsement = 'The station records show that Bristol never fell below 5 knots.';
    const comparison = [
      { role: 'assistant' as const, text: falseClaim, ts: 0 },
      { role: 'user' as const, text: endorsement, ts: 1 },
    ];
    const reliance = {
      ...item('science', 'science', endorsement, 'missed'),
      verification: { kind: 'ai_reliance', material: null, reminder: null, claim: { message: 1, quote: falseClaim } },
    };
    const raw = { ...results(), responsible: [gap('essay'), reliance] };
    const contested = { ...data, science: endorsement, comparison };
    expect(provisionalScore(validateEvidence({ ...contested, comparison: [] }, raw)).levels.responsible).toBe('Not enough evidence');
    expect(provisionalScore(validateEvidence(contested, {
      ...raw, responsible: [gap('essay'), { ...reliance, sourceId: 'science-chat-2' }],
    })).levels.responsible).toBe('Not enough evidence');
    const assessed = validateEvidence(contested, raw);
    expect(assessed.evidence.responsible[1].verification?.claim).toEqual({ message: 1, quote: falseClaim });
    expect(provisionalScore(assessed).levels.responsible).toBe('Need Work');
  });

  it('requires a full quoted statement instead of a fragment from an unrelated claim', () => {
    const raw = { ...results(), responsible: [gap('essay'), verified('met')] };
    const fragment = { message: 1, quote: 'The station log' };
    raw.responsible[1].verification = { kind: 'student_initiated', material: 'station log', reminder: null, claim: fragment };
    const comparison = [
      { role: 'assistant' as const, text: 'The station log includes an Edinburgh station.', ts: 0 },
      data.comparison[1],
    ];
    expect(provisionalScore(validateEvidence({ ...data, comparison }, raw)).levels.responsible).toBe('Not enough evidence');

    raw.responsible[1].verification.claim = claim;
    comparison[0].text = '- ' + claim.quote + '\n- Heathrow had 41 readings below five knots.';
    expect(provisionalScore(validateEvidence({ ...data, comparison }, raw)).levels.responsible).toBe('Great');
  });

  it('counts a source check for Responsible before Critical', () => {
    const raw = { ...results(), responsible: [gap('essay'), verified('met')], critical: [gap('essay'), item('science', 'science-chat-2', check)] };
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.responsible[1]).toMatchObject({ quote: check, outcome: 'met' });
    expect(feedback.evidence.critical.find(entry => entry.task === 'science')).toMatchObject({ outcome: 'insufficient', quote: null });
  });

  it('reports per-task levels and flags Great with Need Work as mixed', () => {
    const raw = results();
    raw.effective = [item('essay', 'revision', draft, 'missed'), item('science', 'science', recommendation)];
    expect(provisionalScore(validateEvidence(data, raw)).results.effective).toMatchObject({
      tasks: { essay: 'Need Work', science: 'Great' }, level: 'Fair', range: ['Need Work', 'Great'], points: 60, mixed: true,
      verifiedEvidenceItems: 2, observedTasks: ['essay', 'science'], singleEvidenceItem: false,
      strength: { n: 2, successes: 1 },
    });
  });

  it('flags a dimension whose level rests on one verified item without changing the score', () => {
    const score = provisionalScore(validateEvidence(data, results()));
    expect(score.results.responsible).toMatchObject({
      level: 'Need Work', verifiedEvidenceItems: 1, observedTasks: ['science'], singleEvidenceItem: true,
    });
    expect(score.results.critical).toMatchObject({ level: 'Fair', singleEvidenceItem: true });
    expect(score.results.effective.singleEvidenceItem).toBe(false);
    expect(score.total).toBe((100 + 60 + 20) / 3 + 5);
  });
});

describe('combineLevels', () => {
  it('averages task points without rounding and ignores missing evidence', () => {
    expect(combineLevels('Great', 'Fair')).toEqual({ level: 'Fair', range: ['Fair', 'Great'], points: 80, mixed: false });
    expect(combineLevels('Fair', 'Need Work')).toEqual({ level: 'Need Work', range: ['Need Work', 'Fair'], points: 40, mixed: false });
    expect(combineLevels('Great', 'Need Work')).toEqual({ level: 'Fair', range: ['Need Work', 'Great'], points: 60, mixed: true });
    expect(combineLevels('Fair', 'Fair')).toEqual({ level: 'Fair', range: null, points: 60, mixed: false });
    expect(combineLevels('Not enough evidence', 'Need Work')).toMatchObject({ level: 'Need Work', range: null, points: 20 });
    expect(combineLevels('Not enough evidence', 'Not enough evidence')).toMatchObject({ level: 'Not enough evidence', points: null });
    expect(combineLevels('Not enough evidence', 'Great', true)).toMatchObject({ level: 'Great', points: null });
  });
});

describe('evidenceStrength', () => {
  const scored = (outcome: string, verification?: Verification) =>
    ({ task: 'science' as const, quote: 'q', source: 'chat' as const, sourceLabel: 'Chat', outcome: outcome as 'met', reason: 'r', improvement: 'i', verification });

  it('gives the Jeffreys posterior mean and a 90% interval, and marks one item as wide', () => {
    const one = evidenceStrength('effective', [scored('met')])!;
    expect(one).toMatchObject({ n: 1, successes: 1, wide: true });
    expect(one.mean).toBeCloseTo(0.75);
    expect(one.interval[0]).toBeCloseTo(0.229, 3);
    const two = evidenceStrength('effective', [scored('met'), { ...scored('met'), task: 'essay' }])!;
    expect(two.mean).toBeCloseTo(2.5 / 3);
    expect(two.interval[0]).toBeCloseTo(0.431, 3);
    expect(two.wide).toBe(false);
  });

  it('counts partial as half a success, including a Responsible check the student did not start', () => {
    const reminded: Verification = { kind: 'after_ai_reminder', material: 'station log', reminder: null, claim };
    const strength = evidenceStrength('responsible', [scored('met', reminded), { ...scored('missed'), task: 'essay' }, scored('insufficient')])!;
    expect(strength).toMatchObject({ n: 2, successes: 0.5 });
    expect(strength.mean).toBeCloseTo(1 / 3);
  });

  it('returns null without verified items', () => {
    expect(evidenceStrength('critical', [scored('insufficient')])).toBeNull();
  });
});


describe('versioned results and evidence boundaries', () => {
  it.each([
    ['met', 'met', 100], ['missed', 'missed', 20], ['met', 'partial', 80],
    ['partial', 'missed', 40], ['met', 'missed', 60], ['met', 'insufficient', 100],
    ['insufficient', 'insufficient', null],
  ] as const)('combines %s and %s across both core tasks', (essayOutcome, scienceOutcome, expected) => {
    const raw = results();
    raw.bonus = [gap('essay'), gap('science')];
    raw.responsible = [gap('essay'), gap('science')];
    raw.effective = [essayOutcome === 'insufficient' ? item('essay', '', '', 'insufficient') : item('essay', 'revision', draft, essayOutcome),
      scienceOutcome === 'insufficient' ? item('science', '', '', 'insufficient') : item('science', 'science', recommendation, scienceOutcome)];
    raw.critical = [essayOutcome === 'insufficient' ? gap('essay') : item('essay', 'revision', essay, essayOutcome, firstDraftQuote),
      scienceOutcome === 'insufficient' ? gap('science') : item('science', 'science-chat-2', scienceDecision, scienceOutcome)];
    const score = provisionalScore(validateEvidence(data, raw));
    expect(score.results.effective.points).toBe(expected);
    expect(score.results.critical.points).toBe(expected);
    expect(score.total).toBe(expected);
    expect(score.assessed).toBe(expected === null ? 0 : 2);
  });

  it('does not apply current rules to unversioned, old or future feedback', () => {
    const current = validateEvidence(data, results());
    expect(current).toMatchObject({ schema: evidenceVersion, scoringVersion });
    for (const saved of [
      { ...current, scoringVersion: undefined }, { ...current, schema: 1 as const },
      { ...current, schema: 2 as const }, { ...current, scoringVersion: scoringVersion + 1 },
    ]) expect(() => provisionalScore(saved)).toThrow('explicit re-assessment');
  });

  it('derives source references from the matched text and ignores model observation IDs', () => {
    const raw = results();
    Object.assign(raw.effective[0], { observationId: 'independent-999', sourceRef: { id: 'fake', start: 99, end: 999 } });
    const feedback = validateEvidence(data, raw);
    expect(feedback.evidence.effective[0].sourceRef).toEqual({ id: 'revision', start: 0, end: draft.length });
    expect(feedback.evidence.effective[0]).not.toHaveProperty('observationId');
  });

  it('does not inflate the indicator with different quotations from the same decision', () => {
    const raw = results();
    const decision = 'I chose Bristol after comparing it with Heathrow. Steadiness was the reason for my choice.';
    raw.effective.push(item('science', 'science', 'Steadiness was the reason for my choice.'));
    raw.effective[1] = item('science', 'science', 'I chose Bristol after comparing it with Heathrow.');
    const feedback = validateEvidence({ ...data, science: decision }, raw);
    const result = provisionalScore(feedback).results.effective;
    expect(result.verifiedEvidenceItems).toBe(3);
    expect(result.strength).toMatchObject({ n: 2, successes: 2 });
    expect(result.strength).toEqual(evidenceStrength('effective', [feedback.evidence.effective[0], feedback.evidence.effective[1]]));
    expect(result.points).toBe(100);
  });

  it('rejects duplicate and overlapping quotes within a task without losing a different task', () => {
    const raw = results();
    raw.effective = [item('essay', 'revision', draft), item('essay', 'revision', draft),
      item('essay', 'revision', 'discovery hides years'), item('science', 'science', draft)];
    const result = provisionalScore(validateEvidence({ ...data, science: draft }, raw)).results.effective;
    expect(result).toMatchObject({ verifiedEvidenceItems: 2, observedTasks: ['essay', 'science'], strength: { n: 2 }, points: 100 });
  });

  it('leaves strength and task points unchanged when an outcome is repeated', () => {
    const feedback = validateEvidence(data, results());
    const items = feedback.evidence.effective;
    expect(evidenceStrength('effective', [...items, ...items])).toEqual(evidenceStrength('effective', items));
    expect(provisionalScore({ ...feedback, evidence: { ...feedback.evidence, effective: [...items, ...items] } }).total)
      .toBe(provisionalScore(feedback).total);
  });
});

describe('consensusEvidence', () => {
  const level = (feedback: ReturnType<typeof consensusEvidence>, dimension: 'effective' | 'responsible', task: string) =>
    provisionalScore(feedback).results[dimension].tasks[task as 'essay' | 'science'];

  it('keeps a task level that two of three runs reach and drops one that only a single run reaches', () => {
    const withCheck = { ...results(), responsible: [gap('essay'), verified('met')] };
    const without = { ...results(), responsible: [gap('essay'), gap('science')] };
    const missed = { ...results(), effective: [item('essay', 'revision', draft, 'missed'), item('science', 'science', recommendation)] };
    const majority = consensusEvidence(data, [withCheck, without, withCheck]);
    expect(majority.runs).toEqual({ requested: 3, valid: 3 });
    expect(level(majority, 'responsible', 'science')).toBe('Great');
    const minority = consensusEvidence(data, [withCheck, without, without]);
    expect(level(minority, 'responsible', 'science')).toBe('Not enough evidence');
    expect(level(consensusEvidence(data, [missed, withCheck, without]), 'effective', 'essay')).toBe('Great');
  });

  it('reports no level when all runs disagree and falls back to a single valid run', () => {
    const great = { ...results(), effective: [item('essay', 'revision', draft), item('science', 'science', recommendation)] };
    const partial = { ...great, effective: [item('essay', 'revision', draft, 'partial'), great.effective[1]] };
    const missed = { ...great, effective: [item('essay', 'revision', draft, 'missed'), great.effective[1]] };
    const split = consensusEvidence(data, [great, partial, missed]);
    expect(level(split, 'effective', 'essay')).toBe('Not enough evidence');
    expect(level(split, 'effective', 'science')).toBe('Great');
    const single = consensusEvidence(data, [null, 'not json', great]);
    expect(single.runs).toEqual({ requested: 3, valid: 1 });
    expect(level(single, 'effective', 'essay')).toBe('Great');
    expect(() => consensusEvidence(data, [null, null])).toThrow();
  });

  it('applies one-action-one-dimension again after merging rows from different runs', () => {
    const asResponsible = { ...results(), responsible: [gap('essay'), verified('met')], critical: [gap('essay'), gap('science')] };
    const asCritical = { ...results(), responsible: [gap('essay'), gap('science')], critical: [gap('essay'), item('science', 'science-chat-2', check)] };
    const merged = consensusEvidence(data, [asResponsible, asCritical, { ...asResponsible, critical: asCritical.critical }]);
    expect(level(merged, 'responsible', 'science')).toBe('Great');
    expect(merged.evidence.critical.find(entry => entry.task === 'science')).toMatchObject({ outcome: 'insufficient', quote: null });
  });
});

it('does not pick an order-dependent winner when two pairs of model reviews disagree', () => {
  const great = results();
  const missed = { ...results(), effective: [item('essay', 'revision', draft, 'missed'), item('science', 'science', recommendation)] };
  const partial = { ...results(), effective: [item('essay', 'revision', draft, 'partial'), item('science', 'science', recommendation)] };
  for (const runs of [[great, great, missed, missed, partial], [missed, missed, great, great, partial]]) {
    expect(provisionalScore(consensusEvidence(data, runs)).results.effective.tasks.essay).toBe('Not enough evidence');
  }
});

it('does not promote a consensus level when cross-dimension deduplication removes negative evidence', () => {
  const otherCheck = 'I checked the station log separately and compared the calm days.';
  const input = { ...data, comparison: [data.comparison[0], { ...data.comparison[1], text: data.comparison[1].text + '\n' + otherCheck }] };
  const first = { ...results(), responsible: [gap('essay'), {
    ...item('science', 'science-chat-2', otherCheck, 'missed'),
    verification: { kind: 'student_initiated' as const, material: 'station log', reminder: null, claim },
  }], critical: [gap('essay'), item('science', 'science-chat-2', scienceDecision), item('science', 'science-chat-2', check, 'missed')] };
  const second = { ...results(), responsible: [gap('essay'), verified('met')], critical: [gap('essay'), item('science', 'science-chat-2', constraint)] };
  const third = { ...results(), responsible: [gap('essay'), verified('met')], critical: [gap('essay'), item('science', 'science-chat-2', scienceDecision, 'partial')] };
  expect(provisionalScore(validateEvidence(input, first)).results.critical.tasks.science).toBe('Fair');
  const score = provisionalScore(consensusEvidence(input, [first, second, third]));
  expect(score.results.responsible.tasks.science).toBe('Great');
  expect(score.results.critical.tasks.science).toBe('Not enough evidence');
});
