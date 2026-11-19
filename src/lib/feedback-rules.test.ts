import { describe, expect, it } from 'vitest';
import { capPrompted, combineLevels, finaliseRatings, sameEvidence } from './feedback-rules';

const IE = 'Not enough evidence';

describe('combineLevels', () => {
  it('rounds the mean of two observed levels down', () => {
    expect(combineLevels('Great', 'Great')).toEqual({ level: 'Great', mixed: false });
    expect(combineLevels('Great', 'Fair')).toEqual({ level: 'Fair', mixed: false });
    expect(combineLevels('Fair', 'Need Work')).toEqual({ level: 'Need Work', mixed: false });
  });
  it('flags Great with Need Work as mixed and reports Fair', () => {
    expect(combineLevels('Need Work', 'Great')).toEqual({ level: 'Fair', mixed: true });
  });
  it('uses the other task when one has no evidence', () => {
    expect(combineLevels(IE, 'Need Work').level).toBe('Need Work');
    expect(combineLevels('Great', IE).level).toBe('Great');
    expect(combineLevels(IE, IE).level).toBe(IE);
  });
  it('gives bonus Great when either task shows it', () => {
    expect(combineLevels(IE, 'Great', true).level).toBe('Great');
    expect(combineLevels(IE, IE, true).level).toBe(IE);
  });
});

it('caps prompted Great at Fair only', () => {
  expect(capPrompted('Great', 'specific')).toBe('Fair');
  expect(capPrompted('Great', 'general')).toBe('Great');
  expect(capPrompted('Need Work', 'specific')).toBe('Need Work');
});

it('treats equal or long contained excerpts as the same evidence', () => {
  expect(sameEvidence('Heathrow', 'Heathrow')).toBe(true);
  expect(sameEvidence('Heathrow', 'Heathrow is calm 25% of the time')).toBe(false);
  expect(sameEvidence('Heathrow is calm 25% of the time', 'I checked: Heathrow is calm 25% of the time.')).toBe(true);
  expect(sameEvidence('', 'anything')).toBe(false);
});

const draft = 'Dramatic stories are easier to remember than slow work.';
const revision = 'Dramatic stories are easier to remember, but they hide the slow work behind discoveries.';
const science = 'I recommend Bristol. The full log shows Heathrow is below 5 knots about 25% of the time, not never.';
const check = 'I checked the full log and Heathrow is below 5 knots about 25% of the time';
const data = {
  draft, revision, science,
  discussion: [{ role: 'user' as const, text: 'Challenge my point about memory.', ts: 1 }],
  comparison: [{ role: 'user' as const, text: check, ts: 2 }],
};
const task = (level: string, quote = '', extra = {}) => ({ opportunity: true, support: 'none', level, detail: 'Reason.', quote, ...extra });
const row = (level: string, essay: object, scienceTask: object) => ({ level, comment: 'Short comment.', next: 'Try this.', tasks: { essay, science: scienceTask } });
const input = () => ({
  effective: row('Great', task('Great', revision), task('Fair', 'I recommend Bristol.')),
  critical: row('Great', task('Great', revision, { draftQuote: draft, revisionQuote: revision }), task('Great', check)),
  responsible: row('Great', task(IE), task('Great', check)),
  bonus: row(IE, task(IE), task(IE)),
});

describe('finaliseRatings', () => {
  it('combines task levels on the server and keeps the model comment only when levels agree', () => {
    const out = finaliseRatings(input(), data);
    expect(out.effective.level).toBe('Fair');
    expect(out.effective.comment).toBe('Your work partly demonstrates this skill.');
    expect(out.responsible.level).toBe('Great');
    expect(out.responsible.comment).toBe('Short comment.');
    expect(out.bonus.level).toBe(IE);
  });

  it('moves a source check to Responsible and removes it from Critical', () => {
    const out = finaliseRatings(input(), data);
    expect(out.critical.tasks!.science.level).toBe(IE);
    expect(out.critical.tasks!.science.quote).toBe('');
    expect(out.critical.tasks!.essay.level).toBe('Great');
    expect(out.critical.level).toBe('Great');
  });

  it('drops excerpts that are not in the student writing', () => {
    const raw = input();
    raw.responsible.tasks.science = task('Need Work', 'Heathrow never drops below 5 knots');
    const out = finaliseRatings(raw, data);
    expect(out.responsible.tasks!.science.level).toBe(IE);
    expect(out.responsible.level).toBe(IE);
    expect(out.responsible.comment).toBe('More evidence is needed for this skill.');
  });

  it('reports prompted Great as Fair', () => {
    const raw = input();
    raw.responsible.tasks.science = task('Great', check, { support: 'specific' });
    expect(finaliseRatings(raw, data).responsible.level).toBe('Fair');
  });

  it('marks Great with Need Work as mixed', () => {
    const raw = input();
    raw.effective.tasks.science = task('Need Work', 'I recommend Bristol.');
    const out = finaliseRatings(raw, data);
    expect(out.effective.level).toBe('Fair');
    expect(out.effective.mixed).toBe(true);
    expect(out.effective.comment).toBe('Your two tasks showed this skill differently.');
  });

  it('rejects rows without task levels', () => {
    const raw: any = input();
    delete raw.effective.tasks.essay.level;
    expect(() => finaliseRatings(raw, data)).toThrow('Missing task level');
  });
});
