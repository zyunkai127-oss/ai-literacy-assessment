import { describe, expect, it } from 'vitest';
import { ADAPTIVE_FIXTURES } from './adaptive-fixtures';
import { QUESTIONS } from './adaptive';
describe('provisional adaptive evaluation set', () => {
  it('covers twelve labelled scenarios with three distinct wordings each', () => {
    expect(ADAPTIVE_FIXTURES).toHaveLength(36);
    expect(new Set(ADAPTIVE_FIXTURES.map(f => f.id)).size).toBe(36);
    const groups = [...new Set(ADAPTIVE_FIXTURES.map(f => f.name))]; expect(groups).toHaveLength(12);
    for (const group of groups) expect(new Set(ADAPTIVE_FIXTURES.filter(f => f.name === group).map(f => f.answer)).size).toBe(3);
    for (const f of ADAPTIVE_FIXTURES) expect(QUESTIONS[f.questionId]).toBeDefined();
  });
});
