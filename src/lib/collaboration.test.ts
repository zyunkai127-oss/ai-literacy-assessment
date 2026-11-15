import { describe, expect, it } from 'vitest';
import { collaborationFollowUp, scoreCollaboration, reviewFollowThrough } from './collaboration';
import { scenario } from './scenario';
import type { Observations } from './types';

const observation = (extra: Partial<Observations> = {}): Observations => ({
  mode: 'judge', brief: '', firstInstruction: '', assistantReplies: [], studentMessages: [],
  draftShown: false, flagged: [], leastSure: [], queried: [], queriedAt: {}, openedAt: {},
  confidence: 0.5, declared: 'MINE', namesToAI: [], ghostRequested: false, p2Shown: false,
  p2Accepted: false, onTime: true, quoteText: false, ...extra,
});
const statuses = (o: Partial<Observations>) => scoreCollaboration(scenario, observation(o)).collaboration!;

describe('live collaboration feedback', () => {
  it('does not turn source opens, message count or no interaction into positive evidence', () => {
    const checks = statuses({ openedAt: { survey: 1, quiz: 2, refs: 3 }, studentMessages: Array(10).fill('hello') });
    expect(checks).toHaveLength(6);
    expect(checks.every((c) => c.status === 'insufficient')).toBe(true);
  });
  it('requires follow-through beyond a generic request to check the brief', () => {
    const checks = statuses({ studentMessages: ['Check my brief'], assistantReplies: ['Consider the task requirements.'] });
    expect(checks.find((c) => c.id === 'review')?.status).toBe('insufficient');
  });
  it('recognises reasoned selection without storing student free text', () => {
    const privateText = 'I will omit the conclusion because its causal basis is unclear. private-unique-token';
    const result = scoreCollaboration(scenario, observation({ studentMessages: [privateText], assistantReplies: ['Here are possible interpretations.'] }));
    expect(result.collaboration?.find((c) => c.id === 'selection')?.status).toBe('supported');
    expect(JSON.stringify(result)).not.toContain('private-unique-token');
    expect(result.claims).toEqual([]);
  });
  it('requires a targeted evidence request and attributed final data for tracing evidence', () => {
    const brief = 'The module survey received 48 responses from 120 enrolled students. The quiz note reports a mean of 27.5 for weekly users.';
    expect(statuses({ brief, assistantReplies: ['Consider the sources.'], studentMessages: ['Which source supports the figure?'] }).find((c) => c.id === 'basis')?.status).toBe('supported');
    expect(statuses({ brief, assistantReplies: ['Consider the sources.'] }).find((c) => c.id === 'basis')?.status).toBe('insufficient');
  });
  it('distinguishes an unsupported causal assertion from a qualified conclusion', () => {
    expect(statuses({ brief: 'AI causes better learning.' }).find((c) => c.id === 'uncertainty')?.status).toBe('practise');
    expect(statuses({ brief: 'This observational data cannot establish that AI caused the difference.', assistantReplies: ['Check the method note.'] }).find((c) => c.id === 'uncertainty')?.status).toBe('supported');
  });
  it('flags a disclosure mismatch as a question for reflection, not an authorship verdict', () => {
    const text = 'A careful recommendation should prioritise gradual adoption through structured support, transparent expectations and continuing reflection on how independent judgements are formed.';
    expect(statuses({ brief: text, assistantReplies: [text], declared: 'MINE' }).find((c) => c.id === 'ownership')?.status).toBe('practise');
    expect(statuses({ brief: text, assistantReplies: [text], declared: 'AI' }).find((c) => c.id === 'ownership')?.status).toBe('insufficient');
  });
  it('uses the full-version explanation as evidence of a reasoned choice', () => {
    expect(statuses({ assistantReplies: ['Compare the sources.'], viva: { kind: 'generic', claimId: null, question: 'What did you choose?', answer: 'I kept the comparison because the quiz note supports it.' } }).find((c) => c.id === 'selection')?.status).toBe('supported');
    expect(collaborationFollowUp(observation()).claimId).toBeNull();
  });
});


it('requires a review reply followed by a separate reasoned choice', () => {
  const request = { role: 'user' as const, text: 'Check my brief. I will keep it because it looks fine.', ts: 1 };
  const reply = { role: 'assistant' as const, text: 'Name the survey in the same sentence.', ts: 2 };
  expect(reviewFollowThrough([request])).toBe(false);
  expect(reviewFollowThrough([request, reply])).toBe(false);
  expect(reviewFollowThrough([request, reply, { role: 'user', text: 'I changed the citation because each figure needs a named source.', ts: 3 }])).toBe(true);
});


it('recognises the first demo brief without changing the other five behaviour checks', () => {
  const view = 'One survey commenter uses AI to explain slides, then checks the textbook.';
  const brief = 'The Module survey report, week 8 received 48 responses from 120 students, a 40% response rate. The survey report states that 56% of respondents use AI at least weekly. The Week 9 quiz summary reports means of 27.5/40 for weekly users and 24.5/40 for others. This observational comparison cannot establish causation because students selected their own AI use and attendance differed. ' + view + ' The evidence is inconclusive about AI’s effect on learning. The committee should encourage verification and collect stronger evidence before making a causal claim.';
  const activity = { brief, reviewFollowedThrough: true, assistantReplies: ['Please check the evidence.'], studentMessages: ['Please plan my brief. Which source supports the figure?', 'Please review my brief.', 'I kept the comparison because the method note supports it.'] };
  const result = scoreCollaboration(scenario, observation(activity));
  const noView = scoreCollaboration(scenario, observation({ ...activity, brief: brief.replace(view, '') }));
  expect(result.quality).toMatchObject({ hasView: true, met: true, validPoints: 4, attributed: 4, sourced: true, words: 96 });
  expect(result.collaboration?.find((c) => c.id === 'review')?.status).toBe('supported');
  expect(noView.collaboration?.find((c) => c.id === 'review')?.status).toBe('insufficient');
  expect(result.collaboration?.filter((c) => c.id !== 'review')).toEqual(noView.collaboration?.filter((c) => c.id !== 'review'));
  expect(result.discern).toEqual(noView.discern);
  expect(result.decide).toEqual(noView.decide);
});

const sourcedBrief = 'The survey report states that 56% use AI weekly. The quiz note reports a mean of 27.5. This observational comparison cannot establish causation.';
const stateFor = (text: string) => ({ brief: sourcedBrief, studentMessages: [text], assistantReplies: ['Consider the evidence.'] });
const statusFor = (id: string, o: Partial<Observations>) => statuses(o).find((c) => c.id === id)!.status;

describe('different expressions of requests and decisions', () => {
  it.each(['Could you compare the two groups?', 'Please help me organise the paragraph.', 'Give me feedback on my outline.', 'What does the quiz result mean?'])('recognises a real direction request: %s', (text) => {
    expect(statusFor('direction', stateFor(text))).toBe('supported');
  });
  it.each(['I do not want an outline.', 'The report contains feedback from students.', 'Do not explain the findings.', 'The task says "Please explain the figures".', 'My plan is to submit now.'])('does not reward mentions or refusals: %s', (text) => {
    expect(statusFor('direction', stateFor(text))).toBe('insufficient');
  });
  it.each(['Where did 56% come from?', 'Please identify the sources for those figures.', 'Can you trace that number to the report?', 'How was 27 out of 48 calculated?'])('recognises a targeted evidence request: %s', (text) => {
    expect(statusFor('basis', stateFor(text))).toBe('supported');
  });
  it.each(['I will not check the evidence.', 'The original source says nobody knows why.', 'Sources are listed below.', 'Why is the cafeteria busy? The survey has evidence.'])('does not reward unrelated or negated evidence mentions: %s', (text) => {
    expect(statusFor('basis', stateFor(text))).toBe('insufficient');
  });
  it.each(['I revised the conclusion because the method note limits causality.', 'I left out that claim since the source cannot support it.', 'I chose to retain the comparison as it is supported by the quiz note.', "I won't include the figure because its source is unclear."])('recognises a reasoned task choice: %s', (text) => {
    expect(statusFor('selection', stateFor(text))).toBe('supported');
  });
  it.each(['I changed seats because the bus was crowded.', 'Should I use the figure because it is convenient?', 'If I keep the claim because it sounds good, would that work?', 'The assistant said "I kept the figure because it is correct".', 'I kept the comparison.'])('does not reward unrelated, quoted or hypothetical choices: %s', (text) => {
    expect(statusFor('selection', stateFor(text))).toBe('insufficient');
  });
});

describe('causal wording boundaries', () => {
  it.each(["The data doesn't establish that AI caused the score difference.", 'Correlation does not imply causation in this observational comparison.', 'We cannot infer a causal effect of AI on learning.', 'The findings show an association rather than causation.'])('recognises a qualified conclusion: %s', (brief) => {
    expect(statusFor('uncertainty', { brief, assistantReplies: ['Consider the method note.'] })).toBe('supported');
  });
  it.each(['No students were assigned, but AI causes better learning.', 'This observational study proves AI improves learning.', 'AI not only causes higher scores but also saves time.'])('does not let unrelated negation hide a causal assertion: %s', (brief) => {
    expect(statusFor('uncertainty', { brief })).toBe('practise');
  });
  it.each(['The survey proves that 56% use AI weekly.', 'AI may improve learning.', 'The data are not observational.', 'The gap is not a correlation.'])('does not infer either certainty or a limit from isolated keywords: %s', (brief) => {
    expect(statusFor('uncertainty', { brief, assistantReplies: ['Consider the method note.'] })).toBe('insufficient');
  });
});


const novelReply = 'A careful recommendation should prioritise gradual adoption through structured support, transparent expectations and continuing reflection on how independent judgements are formed.';
const msg = (role: 'user' | 'assistant', text: string, ts: number, extra = {}) => ({ role, text, ts, ...extra });

describe('actual conversation order and distinctive wording', () => {
  it('does not credit a request with only an earlier reply, failed reply or guardrail reply', () => {
    const request = msg('user', 'Please explain the comparison. Which source supports the figure?', 2);
    for (const conversation of [
      [msg('assistant', 'Hello', 1), request],
      [request, msg('assistant', 'Partial response', 3, { failed: true })],
      [request, msg('assistant', 'Guide only', 3, { scripted: 'guide' })],
    ]) {
      const checks = statuses({ ...stateFor(request.text), conversation });
      expect(checks.find((c) => c.id === 'direction')?.status).toBe('insufficient');
      expect(checks.find((c) => c.id === 'basis')?.status).toBe('insufficient');
    }
  });
  it('credits a request followed by a real reply', () => {
    const request = msg('user', 'Please explain the comparison. Which source supports the figure?', 1);
    expect(statusFor('basis', { ...stateFor(request.text), conversation: [request, msg('assistant', 'The survey supports it.', 2)] })).toBe('supported');
  });
  it('does not reward unrelated or hypothetical actions after review', () => {
    const start = [msg('user', 'Please review my brief.', 1), msg('assistant', 'Check the source labels.', 2)];
    for (const text of ['I changed seats because the bus was crowded.', 'If I keep the claim because it sounds good, is that fine?', 'I made no changes.']) {
      expect(reviewFollowThrough([...start, msg('user', text, 3)])).toBe(false);
    }
    expect(reviewFollowThrough([...start, msg('user', 'I revised the source labels because each number needs attribution.', 3)])).toBe(true);
  });
  it('does not reward a failed review reply', () => {
    expect(reviewFollowThrough([msg('user', 'Review my brief.', 1), msg('assistant', 'Partial', 2, { failed: true }), msg('user', 'I kept the comparison because the quiz supports it.', 3)])).toBe(false);
  });
  it('does not accuse source wording or an echoed student draft of being AI-authored', () => {
    const source = scenario.pack[0].body;
    expect(statusFor('ownership', { brief: source, assistantReplies: [source], declared: 'MINE' })).toBe('insufficient');
    expect(statusFor('ownership', { brief: novelReply, assistantReplies: [novelReply], declared: 'MINE', conversation: [msg('user', 'Check my draft: ' + novelReply, 1), msg('assistant', novelReply, 2)] })).toBe('insufficient');
  });
  it('still flags distinctive AI wording copied after it was generated', () => {
    expect(statusFor('ownership', { brief: novelReply, declared: 'MINE', conversation: [msg('user', 'Help me.', 1), msg('assistant', novelReply, 2), msg('user', 'I used: ' + novelReply, 3)] })).toBe('practise');
  });
  it('does not judge authorship from a tiny shared phrase', () => {
    expect(statusFor('ownership', { brief: 'Please check the source.', assistantReplies: ['Please check the source.'], declared: 'MINE' })).toBe('insufficient');
  });
});

describe('anchor: the pre-written evidence summary in live mode', () => {
  const brief = 'The week 8 survey found 65% of respondents use AI weekly, and 85% said nobody had shown them how to check an AI answer. Marlowe & Quist (2031) found a 23% gain.';
  it('is absent when the summary was never shown', () => {
    const r = scoreCollaboration(scenario, observation({ brief }));
    expect(r.claims).toEqual([]);
    expect(r.discern.status).toBe('insufficient');
  });
  it('codes the statements by rule when the summary was shown', () => {
    const r = scoreCollaboration(scenario, observation({ brief, draftShown: true }));
    const sdt = Object.fromEntries(r.claims.map((c) => [c.id, c.sdt]));
    expect(sdt).toMatchObject({ c2: 'MISS', c3: 'MISS', c5: 'CR' });
    expect(r.discern.type).toBe('CREDULOUS');
    expect(r.collaboration).toHaveLength(6);
  });
  it('counts a corrected figure and a rejection written in the chat', () => {
    const r = scoreCollaboration(scenario, observation({
      draftShown: true, studentMessages: ['The Marlowe study is made up, I will leave it out.'],
      brief: 'The week 8 survey found 56% of respondents use AI weekly, and 85% said nobody had shown them how to check an AI answer.',
    }));
    const c = Object.fromEntries(r.claims.map((x) => [x.id, x]));
    expect([c.c2.sdt, c.c2.ladder, c.c3.sdt, c.c5.sdt]).toEqual(['HIT', 2, 'HIT', 'CR']);
    expect(r.discern.type).toBe('CALIBRATED');
  });
});

describe('anchor uses the debrief and restores the confident error', () => {
  const brief = 'The week 8 survey found 65% of respondents use AI weekly, and 85% said nobody had shown them how to check an AI answer.';
  it('flags the confident-and-wrong moment and reports Decide', () => {
    const r = scoreCollaboration(scenario, observation({ brief, draftShown: true, confidence: 0.85, flagged: ['c3', 'c4'], queried: ['c2'] }));
    expect(r.headline).toMatchObject({ kind: 'E1', claimId: 'c2' });
    expect(r.incidents).toEqual(['E1']);
    expect(r.claims.find((c) => c.id === 'c2')).toMatchObject({ ladder: 1, sdt: 'HIT' });
    expect(r.decide.status).toBe('ok');
    expect(r.discern.type).toBe('CALIBRATED');
  });
  it('does not flag it when the student listed the statement as least sure', () => {
    const r = scoreCollaboration(scenario, observation({ brief, draftShown: true, confidence: 0.85, leastSure: ['c2'] }));
    expect(r.incidents).toEqual([]);
  });
});
