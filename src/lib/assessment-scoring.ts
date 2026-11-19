import { dimensions } from './secondary';

export const coreDimensions = ['effective', 'critical', 'responsible'] as const;
export const rubricDimensions = [...coreDimensions, 'bonus'] as const;
export type Dimension = keyof typeof dimensions;
export type Task = 'essay' | 'science';
export const tasks = ['essay', 'science'] as const;
export const outcomes = ['met', 'partial', 'missed', 'insufficient'] as const;
export type Outcome = typeof outcomes[number];
export type Level = 'Great' | 'Fair' | 'Need Work' | 'Not enough evidence';

export const criteria: Record<Dimension, Record<Task, string>> = {
  effective: {
    essay: 'Support a clear argument with reasoning and a relevant example.',
    science: 'Compare the recommended site with one alternative and interpret the supplied measurements accurately.',
  },
  critical: {
    essay: 'Explain why you kept, changed or rejected a specific idea from the AI discussion.',
    science: 'Explain why you accepted, qualified or rejected a specific AI suggestion about the sites.',
  },
  responsible: {
    essay: 'Check a specific factual claim against a source and use the result accurately.',
    science: 'Check a specific AI claim against the supplied evidence and use the result accurately.',
  },
  bonus: {
    essay: 'Clarify a task requirement or deliberately give the AI context that improves its help.',
    science: 'Clarify a task requirement or deliberately give the AI context that improves its help.',
  },
};

export type EvidenceItem = {
  task: Task;
  quote: string | null;
  firstDraftQuote?: string;
  source: 'essay' | 'submission' | 'chat' | null;
  sourceLabel: string | null;
  outcome: Outcome;
  reason: string;
  improvement: string;
};
export type EvidenceFeedback = { schema: 1; evidence: Record<Dimension, EvidenceItem[]> };

// Provisional settings pending academic calibration.
export const provisionalScheme = {
  points: { Great: 100, Fair: 60, 'Need Work': 20, 'Not enough evidence': null },
  minimumCoreDimensions: 2,
  bonus: 5,
  cap: 100,
} as const satisfies {
  points: Record<Level, number | null>;
  minimumCoreDimensions: number;
  bonus: number;
  cap: number;
};

export function dimensionLevel(dimension: Dimension, items: EvidenceItem[]): Level {
  const observed = items.filter(item => item.outcome !== 'insufficient');
  if (!observed.length) return 'Not enough evidence';
  if (dimension === 'bonus') return observed.some(item => item.outcome === 'met') ? 'Great' : 'Not enough evidence';
  if (observed.every(item => item.outcome === 'met')) return 'Great';
  const met = observed.some(item => item.outcome === 'met');
  const missed = observed.some(item => item.outcome === 'missed');
  if (!met && missed) return 'Need Work';
  return 'Fair';
}

export function provisionalScore(feedback: EvidenceFeedback) {
  const levels = {
    effective: dimensionLevel('effective', feedback.evidence.effective),
    critical: dimensionLevel('critical', feedback.evidence.critical),
    responsible: dimensionLevel('responsible', feedback.evidence.responsible),
    bonus: dimensionLevel('bonus', feedback.evidence.bonus),
  };
  const observed = coreDimensions.map(key => provisionalScheme.points[levels[key]]).filter(value => value !== null);
  const base = observed.length < provisionalScheme.minimumCoreDimensions
    ? null
    : observed.reduce((sum, value) => sum + value, 0) / observed.length;
  const bonus = levels.bonus === 'Great' ? provisionalScheme.bonus : 0;
  const total = base === null ? null : Math.min(provisionalScheme.cap, base + bonus);
  return { levels, assessed: observed.length, total, bonusApplied: total === null || base === null ? 0 : total - base };
}
