import { betaQuantile } from './beta';
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

export const verificationKinds = ['student_initiated', 'after_ai_reminder', 'ai_reliance', 'unclear_initiator'] as const;
export type Verification = {
  kind: typeof verificationKinds[number];
  material: string | null;
  reminder: { message: number; quote: string } | null;
  /** The earlier assistant claim that the student checked or repeated, verified against the transcript. */
  claim?: { message: number; quote: string } | null;
};

/** 3: evidence is the consensus of several assessor runs. */
export const evidenceVersion = 3;

export type EvidenceItem = {
  task: Task;
  quote: string | null;
  firstDraftQuote?: string;
  source: 'essay' | 'submission' | 'chat' | null;
  sourceLabel: string | null;
  outcome: Outcome;
  verification?: Verification;
  reason: string;
  improvement: string;
};
export type EvidenceFeedback = {
  schema: 1 | 2 | typeof evidenceVersion;
  evidence: Record<Dimension, EvidenceItem[]>;
  /** Assessor runs requested and runs that passed verification. */
  runs?: { requested: number; valid: number };
};

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

/**
 * A Responsible check counts as fully met only when the record shows the student started it.
 * A check made after an AI reminder, or with no confirmed initiator, counts as partly met.
 */
export function scoredOutcome(dimension: Dimension, item: EvidenceItem): Outcome {
  if (dimension === 'responsible' && item.outcome === 'met' && item.verification?.kind !== 'student_initiated') return 'partial';
  return item.outcome;
}

/** Level for one task from its verified items. */
export function taskLevel(dimension: Dimension, items: EvidenceItem[]): Level {
  const observed = items.filter(item => item.outcome !== 'insufficient').map(item => scoredOutcome(dimension, item));
  if (!observed.length) return 'Not enough evidence';
  if (dimension === 'bonus') return observed.includes('met') ? 'Great' : 'Not enough evidence';
  if (observed.every(outcome => outcome === 'met')) return 'Great';
  if (!observed.includes('met') && observed.includes('missed')) return 'Need Work';
  return 'Fair';
}

/**
 * Session result from the two task levels. Missing evidence in one task never lowers the other.
 * With two observed levels the points are averaged without rounding, so Great with Fair gives 80.
 * level is the highest band the averaged points reach, and range gives both task levels when they
 * differ. Great with Need Work gives Fair at 60 and is marked mixed. Bonus needs one Great and has no points.
 */
export function combineLevels(essay: Level, science: Level, bonus = false): {
  level: Level; range: [Level, Level] | null; points: number | null; mixed: boolean;
} {
  const order: Level[] = ['Need Work', 'Fair', 'Great'];
  const seen = [essay, science].filter(level => order.includes(level)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (bonus) return { level: seen.includes('Great') ? 'Great' : 'Not enough evidence', range: null, points: null, mixed: false };
  if (!seen.length) return { level: 'Not enough evidence', range: null, points: null, mixed: false };
  const points = seen.reduce((sum, level) => sum + (provisionalScheme.points[level] as number), 0) / seen.length;
  const [low, high] = [seen[0], seen[seen.length - 1]];
  const level = order.filter(band => (provisionalScheme.points[band] as number) <= points).pop() as Level;
  return { level, range: low === high ? null : [low, high], points, mixed: low === 'Need Work' && high === 'Great' };
}

/**
 * Evidence coverage for one dimension. observations counts the verified items that were scored,
 * across both tasks. With exactly one, the level rests on a single observation, so the report
 * flags it as an indication rather than a stable pattern. The flag does not change the score.
 */
export function evidenceCoverage(items: EvidenceItem[]) {
  const scored = items.filter(item => item.outcome !== 'insufficient');
  return {
    observations: scored.length,
    observedTasks: tasks.filter(task => scored.some(item => item.task === task)),
    singleObservation: scored.length === 1,
  };
}

export const strengthScheme = { prior: 0.5, credibility: 0.9, wideInterval: 0.6, partialCredit: 0.5 } as const;

/**
 * Evidence strength for one dimension, shown beside the level and never used in the score.
 * Each verified item is a trial: met = 1 success, partial = 0.5, missed = 0. With s successes in
 * n trials, the Jeffreys posterior is Beta(s + 0.5, n − s + 0.5). Its mean estimates how often the
 * student meets the criterion, and the 90% equal-tailed interval shows how uncertain that is.
 */
export function evidenceStrength(dimension: Dimension, items: EvidenceItem[]) {
  const outcomes = items.filter(item => item.outcome !== 'insufficient').map(item => scoredOutcome(dimension, item));
  if (!outcomes.length) return null;
  const n = outcomes.length;
  const successes = outcomes.reduce((sum, outcome) =>
    sum + (outcome === 'met' ? 1 : outcome === 'partial' ? strengthScheme.partialCredit : 0), 0);
  const a = successes + strengthScheme.prior, b = n - successes + strengthScheme.prior;
  const tail = (1 - strengthScheme.credibility) / 2;
  const interval: [number, number] = [betaQuantile(tail, a, b), betaQuantile(1 - tail, a, b)];
  return { n, successes, mean: a / (a + b), interval, wide: interval[1] - interval[0] > strengthScheme.wideInterval };
}

export function dimensionResult(dimension: Dimension, items: EvidenceItem[]) {
  const levels = Object.fromEntries(tasks.map(task =>
    [task, taskLevel(dimension, items.filter(item => item.task === task))])) as Record<Task, Level>;
  return {
    tasks: levels, ...combineLevels(levels.essay, levels.science, dimension === 'bonus'), ...evidenceCoverage(items),
    strength: dimension === 'bonus' ? null : evidenceStrength(dimension, items),
  };
}

export function dimensionLevel(dimension: Dimension, items: EvidenceItem[]): Level {
  return dimensionResult(dimension, items).level;
}

export function provisionalScore(feedback: EvidenceFeedback) {
  const results = Object.fromEntries(rubricDimensions.map(dimension =>
    [dimension, dimensionResult(dimension, feedback.evidence[dimension])])) as Record<Dimension, ReturnType<typeof dimensionResult>>;
  const levels = Object.fromEntries(rubricDimensions.map(dimension => [dimension, results[dimension].level])) as Record<Dimension, Level>;
  const observed = coreDimensions.map(key => results[key].points).filter(value => value !== null);
  const base = observed.length < provisionalScheme.minimumCoreDimensions
    ? null
    : observed.reduce((sum, value) => sum + value, 0) / observed.length;
  const bonus = levels.bonus === 'Great' ? provisionalScheme.bonus : 0;
  const total = base === null ? null : Math.min(provisionalScheme.cap, base + bonus);
  return { levels, results, assessed: observed.length, total, bonusApplied: total === null || base === null ? 0 : total - base };
}
