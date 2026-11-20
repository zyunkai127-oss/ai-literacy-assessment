import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Factors } from '../app/assessment/[id]/Factors';
import { evidenceVersion, scoringVersion, type EvidenceFeedback, type EvidenceItem } from './assessment-scoring';
import type { Ratings } from './secondary';

const item = (task: 'essay' | 'science', outcome: EvidenceItem['outcome']): EvidenceItem => ({
  task, outcome, source: 'chat', sourceLabel: 'Chat · Message 2',
  quote: 'I chose this because the comparison supports it.',
  reason: 'The comparison supports this decision.', improvement: 'Check one claim against the source.',
});
const current: EvidenceFeedback = {
  schema: evidenceVersion, scoringVersion,
  evidence: {
    effective: [item('essay', 'met'), item('science', 'partial')],
    critical: [item('essay', 'met'), item('science', 'missed')],
    responsible: [item('essay', 'insufficient'), item('science', 'insufficient')],
    bonus: [item('essay', 'insufficient'), item('science', 'insufficient')],
  },
};

describe('saved results presentation', () => {
  it('explains the task scores, combined score, coverage and evidence without an ability probability', () => {
    const html = renderToStaticMarkup(<Factors url="/api/assessment/test" saved={current} />);
    expect(html).toContain('70%');
    expect(html).toContain('Great — 100/100');
    expect(html).toContain('Fair — 60/100');
    expect(html).toContain('80/100');
    expect(html).toContain('Average of the two observed task scores.');
    expect(html).toContain('Verified Evidence Items · 2');
    expect(html).toContain('Exploratory Evidence Indicator');
    expect(html).toContain('<summary>Indicator methodology and limitations</summary>');
    expect(html).toContain('not a validated probability');
    expect(html).not.toContain('estimated 75% meeting');
    expect(html).toContain(current.evidence.effective[0].quote!);
    expect(html).toContain(current.evidence.effective[0].reason);
    expect(html).toContain(current.evidence.effective[0].improvement);
  });

  it.each([
    { schema: 2 as const, scoringVersion: undefined },
    { schema: evidenceVersion, scoringVersion: undefined },
    { schema: evidenceVersion, scoringVersion: scoringVersion + 1 },
  ] as const)('shows saved feedback without calculating a new score for $schema / $scoringVersion', versions => {
    const html = renderToStaticMarkup(<Factors url="/api/assessment/test" saved={{ ...current, ...versions }} />);
    expect(html).toContain('Saved report');
    expect(html).toContain('Re-assess with current rules');
    expect(html).toContain(current.evidence.effective[0].quote!);
    expect(html).not.toContain('70%');
    expect(html).not.toContain('80/100');
    expect(html).not.toContain('Exploratory Evidence Indicator');
    expect(html).not.toContain('Score impact');
  });

  it('preserves legacy ratings and does not confuse them with new evidence results', () => {
    const legacy = { effective: { level: 'Great', comment: 'Saved legacy comment.' } } as Ratings;
    const oldHtml = renderToStaticMarkup(<Factors url="/api/assessment/test" legacy={legacy} />);
    expect(oldHtml).toContain('Saved legacy comment.');
    expect(oldHtml).toContain('Great');
    const newHtml = renderToStaticMarkup(<Factors url="/api/assessment/test" saved={current} legacy={legacy} />);
    expect(newHtml).not.toContain('Saved legacy comment.');
    expect(newHtml).not.toContain('Re-assess with current rules');
  });

  it('explains a missing task and never treats it as zero', () => {
    const saved = { ...current, evidence: { ...current.evidence, effective: [item('essay', 'met'), item('science', 'insufficient')] } };
    const html = renderToStaticMarkup(<Factors url="/api/assessment/test" saved={saved} />);
    expect(html).toContain('100/100');
    expect(html).toContain('Uses the one assessed task only.');
    expect(html).toContain('Single evidence item');
    expect(html).toContain('Tasks with evidence · 1/2');
  });
});
