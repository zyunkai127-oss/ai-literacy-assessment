import {
  evidenceVersion, outcomes, rubricDimensions, tasks, verificationKinds,
  type EvidenceFeedback, type EvidenceItem, type Outcome, type Task, type Verification,
} from './assessment-scoring';
import type { Assessment } from './secondary';

const verificationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['none', ...verificationKinds] },
    material: { type: 'string' },
    reminder: {
      type: 'object',
      additionalProperties: false,
      properties: { message: { type: 'integer' }, quote: { type: 'string' } },
      required: ['message', 'quote'],
    },
    claim: {
      type: 'object',
      additionalProperties: false,
      properties: { message: { type: 'integer' }, quote: { type: 'string' } },
      required: ['message', 'quote'],
    },
  },
  required: ['kind', 'material', 'reminder', 'claim'],
};

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task: { type: 'string', enum: tasks },
    sourceId: { type: 'string' },
    quote: { type: 'string' },
    firstDraftQuote: { type: 'string' },
    outcome: { type: 'string', enum: outcomes },
    reason: { type: 'string' },
    improvement: { type: 'string' },
  },
  required: ['task', 'sourceId', 'quote', 'firstDraftQuote', 'outcome', 'reason', 'improvement'],
};

const responsibleItemSchema = {
  ...itemSchema,
  properties: { ...itemSchema.properties, verification: verificationSchema },
  required: [...itemSchema.required, 'verification'],
};

export const evidenceFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(rubricDimensions.map(dimension => [
      dimension, { type: 'array', items: dimension === 'responsible' ? responsibleItemSchema : itemSchema },
    ])),
    required: [...rubricDimensions],
  },
};

export function evidenceSources(data: Assessment) {
  const writing = [
    { id: 'draft', task: 'essay', source: 'essay', label: 'Essay · First draft', text: data.draft },
    { id: 'revision', task: 'essay', source: 'essay', label: 'Essay · Revised submission', text: data.revision },
    { id: 'science', task: 'science', source: 'submission', label: 'Science · Recommendation', text: data.science },
  ] as const;
  const chat = ([['essay', data.discussion], ['science', data.comparison]] as const).flatMap(([task, history]) =>
    history.flatMap((message, index) => message.role === 'user' && !message.blocked
      ? [{ id: task + '-chat-' + (index + 1), task, source: 'chat' as const, label: 'Chat · Message ' + (index + 1), text: message.text, messageNumber: index + 1 }]
      : []));
  return [...writing, ...chat];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= max;
}

export function validateEvidence(data: Assessment, raw: unknown): EvidenceFeedback {
  if (!isRecord(raw)) throw Error('Invalid rubric results');
  const sources = evidenceSources(data);
  const usedActions: { text: string; quote: string }[] = [];
  const usedFinalWork: typeof usedActions = [];
  const evidence = {} as EvidenceFeedback['evidence'];
  // A source check counts for Responsible first, so Critical needs a different decision.
  // Effective assesses the final work independently from the student's actions.
  for (const dimension of ['responsible', 'critical', 'effective', 'bonus'] as const) {
    const rows = raw[dimension];
    const used = dimension === 'effective' ? usedFinalWork : usedActions;
    if (!Array.isArray(rows)) throw Error('Invalid dimension results');
    const items: EvidenceItem[] = [];
    for (const task of tasks) {
      const candidates = rows.filter(row => isRecord(row) && row.task === task).slice(0, 2);
      const isEssayComparison = dimension === 'critical' && task === 'essay';
      const accepted: EvidenceItem[] = [];
      let gap: EvidenceItem | undefined;
      for (const row of candidates) {
        const { outcome, reason, improvement } = row;
        const quote = row.quote === '' ? null : row.quote;
        const sourceId = row.sourceId === '' ? null : row.sourceId;
        if (!outcomes.includes(outcome as Outcome) || !isText(reason, 500) || !isText(improvement, 500)) continue;
        if (outcome === 'insufficient' && quote === null && sourceId === null) {
          gap ??= { task, quote, source: null, sourceLabel: null, outcome, reason, improvement };
          continue;
        }
        if (dimension === 'bonus' && outcome !== 'met') continue;
        if (!isText(quote, 500)) continue;
        const source = sources.find(entry => entry.id === sourceId && entry.task === task);
        if (!source || !source.text.includes(quote)) continue;
        const isFinalSubmission = source.id === (task === 'essay' ? 'revision' : 'science');
        if (dimension === 'effective' && !isFinalSubmission) continue;

        const verification = dimension === 'responsible' ? verifyAttribution(data, source, quote, row.verification) : undefined;
        if (dimension === 'responsible' && !verification) continue;
        if (verification && verification.kind !== 'ai_reliance' && !verification.claim) {
          accepted.push({
            task, quote, source: source.source, sourceLabel: source.label, verification, outcome: 'insufficient',
            reason: 'The record does not link this passage to a complete, checkable claim from the AI.',
            improvement: nextStep.responsible[task],
          });
          continue;
        }
        if (verification?.kind === 'ai_reliance' &&
            (outcome !== 'missed' || !verification.claim || !isFinalSubmission)) {
          accepted.push({
            task, quote, source: source.source, sourceLabel: source.label, verification, outcome: 'insufficient',
            reason: outcome === 'missed'
              ? 'The record does not link a complete earlier AI claim to an error in the final submission.'
              : 'This passage records asking for or using an AI result. Your own source comparison is not shown.',
            improvement: nextStep.responsible[task],
          });
          continue;
        }
        if (outcome === 'insufficient') continue;

        let firstDraftQuote: string | undefined;
        let itemReason = reason;
        let itemImprovement = improvement;
        if (verification?.kind === 'unclear_initiator' && isRecord(row.verification) &&
            row.verification.kind === 'after_ai_reminder') {
          itemReason = 'You report checking this source. The discussion does not confirm what prompted that check.';
        }
        if (isEssayComparison) {
          if (source.source === 'chat') {
            if (row.firstDraftQuote) continue;
            itemReason = 'This rating is based on what you said during the AI discussion.';
            itemImprovement = 'Explain why you accept, qualify or reject a specific suggestion from the assistant.';
          } else {
            if (source.id !== 'revision' || !isText(row.firstDraftQuote, 500) || !data.draft.includes(row.firstDraftQuote)) continue;
            firstDraftQuote = row.firstDraftQuote;
          }
        }
        const passages = (firstDraftQuote ? [quote, firstDraftQuote] : [quote]).map(excerpt => ({
          quote: excerpt,
          text: excerpt.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '),
        }));
        if (passages.some(passage => used.some(entry =>
          entry.text.includes(passage.text) || passage.text.includes(entry.text)
          || sources.some(document => sharesPassage(document.text, entry.quote, passage.quote))))) continue;
        used.push(...passages);
        accepted.push({
          task, quote, firstDraftQuote, source: source.source, sourceLabel: source.label,
          outcome, reason: itemReason, improvement: itemImprovement, ...(verification && { verification }),
        });
        if (isEssayComparison) break;
      }
      items.push(...(accepted.length ? accepted : [gap ?? missingEvidence(task, dimension)]));
    }
    evidence[dimension] = items;
  }
  return { schema: evidenceVersion, evidence };
}

function verifyAttribution(
  data: Assessment, source: ReturnType<typeof evidenceSources>[number], quote: string, value: unknown,
): Verification | undefined {
  if (!isRecord(value)) return;
  const kind = verificationKinds.find(option => option === value.kind);
  if (!kind) return;
  const claim = verifyClaim(data, source, value.claim);
  if (kind === 'ai_reliance') return { kind, material: null, reminder: null, claim };

  if (!isText(value.material, 120)) return;
  const material = materialInQuote(quote, value.material, source.task === 'science' && data.windPack === 2);
  if (!material) return;
  if (kind !== 'after_ai_reminder') return { kind, material, reminder: null, claim };

  const reminder = value.reminder;
  if (isRecord(reminder) && typeof reminder.message === 'number' && Number.isInteger(reminder.message) &&
      reminder.message >= 1 && isText(reminder.quote, 500) && source.id !== 'draft' &&
      (!('messageNumber' in source) || reminder.message < source.messageNumber)) {
    const history = source.task === 'essay' ? data.discussion : data.comparison;
    const message = history[reminder.message - 1];
    if (message?.role === 'assistant' && !message.blocked && message.text.includes(reminder.quote)) {
      return { kind, material, reminder: { message: reminder.message, quote: reminder.quote }, claim };
    }
  }
  return { kind: 'unclear_initiator', material, reminder: null, claim };
}

const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

function quotesCompleteStatement(text: string, quote: string) {
  return text.split(/\r?\n/).some(line => {
    const statement = line.trim().replace(/^(?:[-+*]|\d+[.)])\s+/, '');
    if (!statement.includes(quote) || statement.startsWith('#')) return false;
    if (statement === quote) return true;
    return Array.from(sentences.segment(statement)).some(({ segment }) => segment.trim() === quote);
  });
}

/** Match a complete line or sentence from an earlier assistant message. */
function verifyClaim(data: Assessment, source: ReturnType<typeof evidenceSources>[number], value: unknown) {
  if (!isRecord(value) || typeof value.message !== 'number' || !Number.isInteger(value.message) ||
      value.message < 1 || !isText(value.quote, 500) || source.id === 'draft') return null;
  if ('messageNumber' in source && value.message >= source.messageNumber) return null;
  const message = (source.task === 'essay' ? data.discussion : data.comparison)[value.message - 1];
  return message?.role === 'assistant' && !message.blocked && quotesCompleteStatement(message.text, value.quote)
    ? { message: value.message, quote: value.quote } : null;
}

function materialInQuote(quote: string, label: string, fieldNotebookTask: boolean) {
  const lowerQuote = quote.toLowerCase();
  const name = label.trim().toLowerCase();
  const start = lowerQuote.indexOf(name);
  if (start >= 0) return quote.slice(start, start + name.length);

  // The student can name the same bundled source using a shorter label.
  if (!fieldNotebookTask) return;
  if (/\b(field notebook|windmill test)\b/.test(name)) return quote.match(/\b(?:field )?notebook\b/i)?.[0];
  if (/\bstation[ -]log\b/.test(name)) return quote.match(/\bstation[ -]log(?:\.csv)?\b/i)?.[0];
}

function sharesPassage(text: string, first: string, second: string) {
  for (let start = text.indexOf(first); start >= 0; start = text.indexOf(first, start + 1)) {
    const otherStart = text.indexOf(second, Math.max(0, start - second.length + 1));
    if (otherStart >= 0 && otherStart < start + first.length) return true;
  }
  return false;
}

const nextStep = {
  effective: { essay: 'Support your argument with one specific example and explain how it fits.', science: 'Use a source measurement to compare your site with one alternative.' },
  critical: { essay: 'Explain why you kept or changed a specific idea after the discussion.', science: 'Explain why you accepted or challenged one specific suggestion about a site.' },
  responsible: { essay: 'Name a source and explain what it confirmed or corrected.', science: 'Check one AI claim against a named table or graph and record the result.' },
  bonus: { essay: 'Give the assistant a specific requirement you want it to consider.', science: 'Give the assistant a specific comparison constraint you want it to consider.' },
};

function missingEvidence(task: Task, dimension: keyof typeof nextStep): EvidenceItem {
  return {
    task, quote: null, source: null, sourceLabel: null, outcome: 'insufficient',
    reason: 'There is no verified passage available for this criterion in this task.',
    improvement: nextStep[dimension][task],
  };
}
