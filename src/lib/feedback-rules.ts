import { dimensions, type Assessment, type Level, type Ratings, type TaskFeedback } from './secondary';

// The assessor model reads the records and gives one level per task. Everything below is
// deterministic, so the same per-task judgements always produce the same report.

const IE: Level = 'Not enough evidence';
const points = { 'Need Work': 0, Fair: 1, Great: 2 } as const;
const fromPoints: Level[] = ['Need Work', 'Fair', 'Great'];
const tasks = ['essay', 'science'] as const;

/**
 * Session level from the two task levels. Missing evidence in one task never lowers the other.
 * With two observed levels: Great = 2, Fair = 1, Need Work = 0, mean rounded down.
 * Bonus has only Great or not enough evidence, so one Great is enough.
 */
export function combineLevels(essay: Level, science: Level, bonus = false): { level: Level; mixed: boolean } {
  const seen = [essay, science].filter((level): level is keyof typeof points => level in points);
  if (bonus) return { level: seen.includes('Great') ? 'Great' : IE, mixed: false };
  if (seen.length === 0) return { level: IE, mixed: false };
  if (seen.length === 1) return { level: seen[0], mixed: false };
  const [a, b] = seen.map(level => points[level]);
  return { level: fromPoints[Math.floor((a + b) / 2)], mixed: Math.abs(a - b) === 2 };
}

/** Great reached only after the AI pointed to the exact issue is reported as Fair. */
export function capPrompted(level: Level, support?: string): Level {
  return level === 'Great' && support === 'specific' ? 'Fair' : level;
}

/** Two excerpts are the same evidence when equal, or when one contains the other and is not trivially short. */
export function sameEvidence(a = '', b = '') {
  const x = a.trim(), y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 20 && long.includes(short);
}

const defaultComment = {
  Great: 'Your work demonstrates this skill.',
  Fair: 'Your work partly demonstrates this skill.',
  'Need Work': 'This skill needs more practice.',
} as const;

/** Validate the assessor's JSON against the student's records and compute the session levels. */
export function finaliseRatings(result: any, data: Pick<Assessment, 'draft' | 'revision' | 'science' | 'discussion' | 'comparison'>): Ratings {
  const { draft, revision, science, discussion, comparison } = data;
  const essayMessages = discussion.filter(m => m.role === 'user').map(m => m.text);
  const words = {
    essay: [draft, revision, ...essayMessages],
    science: [science, ...comparison.filter(m => m.role === 'user').map(m => m.text)],
  };
  const mismatch = new Set<string>();

  // 1. Shape and quote checks. An excerpt that cannot be found in the student's own writing is dropped.
  for (const key of Object.keys(dimensions)) {
    const row = result?.[key];
    const allowed: Level[] = key === 'bonus' ? ['Great', IE] : ['Great', 'Fair', 'Need Work', IE];
    if (!row || !allowed.includes(row.level) || typeof row.comment !== 'string' ||
      typeof row.next !== 'string' || !row.next.trim()) throw Error('Incomplete feedback');
    for (const task of tasks) {
      const item = row.tasks?.[task] as TaskFeedback | undefined;
      if (!item || typeof item.detail !== 'string' || !item.detail.trim() || typeof item.quote !== 'string') throw Error('Missing task evidence');
      if (!allowed.includes(item.level as Level)) throw Error('Missing task level');
      item.quote = item.quote.trim();
      if (!['none', 'general', 'specific'].includes(item.support as string)) item.support = 'none';
      item.opportunity = item.opportunity !== false;

      if (key === 'critical' && task === 'essay') {
        const before = typeof item.draftQuote === 'string' ? item.draftQuote.trim() : '';
        const after = typeof item.revisionQuote === 'string' ? item.revisionQuote.trim() : '';
        if (before || after) {
          if (before && after && draft.includes(before) && revision.includes(after)) {
            Object.assign(item, { draftQuote: before, revisionQuote: after, quote: after });
            continue;
          }
        } else if (item.quote && essayMessages.some(message => message.includes(item.quote))) {
          item.detail = 'This student message was recorded during the discussion. We could not verify a comparison between the two drafts for this judgement.';
          mismatch.add(key);
          continue;
        }
      } else if (!item.quote || words[task].some(text => text.includes(item.quote))) {
        continue;
      }
      row.tasks[task] = { ...item, detail: 'We could not verify a supporting passage in this task.', quote: '', draftQuote: undefined, revisionQuote: undefined };
      mismatch.add(key);
    }
  }

  // 2. Per-task levels: no verified excerpt means no evidence; prompted Great becomes Fair.
  for (const key of Object.keys(dimensions)) {
    for (const task of tasks) {
      const item: TaskFeedback = result[key].tasks[task];
      if (!item.quote) item.level = IE;
      else if (key !== 'bonus') item.level = capPrompted(item.level!, item.support);
    }
  }

  // 3. One event, one dimension: a source check counts for Responsible, so Critical needs another decision.
  for (const task of tasks) {
    const responsible: TaskFeedback = result.responsible.tasks[task];
    const critical: TaskFeedback = result.critical.tasks[task];
    if (responsible.level === IE || critical.level === IE) continue;
    if ([critical.quote, critical.revisionQuote].some(quote => sameEvidence(quote, responsible.quote))) {
      result.critical.tasks[task] = {
        ...critical, level: IE, quote: '', draftQuote: undefined, revisionQuote: undefined,
        detail: 'This excerpt already counts as checking a claim under Responsible use. Critical use needs a different decision.',
      };
    }
  }

  // 4. Session levels.
  for (const key of Object.keys(dimensions)) {
    const row = result[key];
    const modelLevel: Level = row.level;
    const { level, mixed } = combineLevels(row.tasks.essay.level, row.tasks.science.level, key === 'bonus');
    row.level = level;
    row.mixed = mixed || undefined;
    if (level === IE) row.comment = 'More evidence is needed for this skill.';
    else if (mixed) row.comment = 'Your two tasks showed this skill differently.';
    else if (level !== modelLevel || mismatch.has(key) || !row.comment.trim() || row.comment.trim().split(/\s+/).length > 10) {
      row.comment = defaultComment[level as keyof typeof defaultComment];
    }
  }
  return result as Ratings;
}
