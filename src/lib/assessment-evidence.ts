import { outcomes, rubricDimensions, tasks, type EvidenceFeedback, type EvidenceItem, type Outcome, type Task } from './assessment-scoring';
import type { Assessment } from './secondary';

export function evidenceSources(data: Assessment) {
  const writing = [
    { id: 'draft', task: 'essay', source: 'essay', label: 'Essay · First draft', text: data.draft },
    { id: 'revision', task: 'essay', source: 'essay', label: 'Essay · Revised submission', text: data.revision },
    { id: 'science', task: 'science', source: 'submission', label: 'Science · Recommendation', text: data.science },
  ] as const;
  const chat = ([['essay', data.discussion], ['science', data.comparison]] as const).flatMap(([task, history]) =>
    history.flatMap((message, index) => message.role === 'user' && !message.blocked
      ? [{ id: task + '-chat-' + (index + 1), task, source: 'chat' as const, label: 'Chat · Message ' + (index + 1), text: message.text }]
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
  const used: { text: string; quote: string }[] = [];
  const evidence = {} as EvidenceFeedback['evidence'];
  // Rubric order resolves competing claims on the same passage consistently.
  for (const dimension of rubricDimensions) {
    const rows = raw[dimension];
    if (!Array.isArray(rows) || rows.length < 2 || rows.length > 4 || rows.some(row =>
      !isRecord(row) || !tasks.includes(row.task as Task) || !outcomes.includes(row.outcome as Outcome)
      || !isText(row.reason, 500) || !isText(row.improvement, 500))) throw Error('Invalid dimension results');
    const items: EvidenceItem[] = [];
    for (const task of tasks) {
      const candidates = rows.filter(row => isRecord(row) && row.task === task);
      if (candidates.length < 1 || candidates.length > 2) throw Error('Invalid task results');
      const accepted: EvidenceItem[] = [];
      let gap: EvidenceItem | undefined;
      for (const row of candidates) {
        const { quote, sourceId, outcome, reason, improvement } = row;
        if (!isText(reason, 500) || !isText(improvement, 500)) continue;
        if (outcome === 'insufficient') {
          if (quote === null && sourceId === null) gap ??= { task, quote, source: null, sourceLabel: null, outcome, reason, improvement };
          continue;
        }
        if (dimension === 'bonus' && outcome !== 'met') continue;
        if (!isText(quote, 500)) continue;
        const source = sources.find(entry => entry.id === sourceId && entry.task === task);
        if (!source || !source.text.includes(quote)) continue;
        if (dimension === 'effective' && source.id !== (task === 'essay' ? 'revision' : 'science')) continue;
        let firstDraftQuote: string | undefined;
        if (dimension === 'critical' && task === 'essay' && source.source !== 'chat') {
          if (source.id !== 'revision' || !isText(row.firstDraftQuote, 500) || !data.draft.includes(row.firstDraftQuote)) continue;
          firstDraftQuote = row.firstDraftQuote;
        }
        const passages = (firstDraftQuote ? [quote, firstDraftQuote] : [quote]).map(excerpt => ({
          quote: excerpt,
          text: excerpt.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '),
        }));
        if (passages.some(passage => used.some(entry =>
          entry.text.includes(passage.text) || passage.text.includes(entry.text)
          || sources.some(document => sharesPassage(document.text, entry.quote, passage.quote))))) continue;
        used.push(...passages);
        accepted.push({ task, quote, firstDraftQuote, source: source.source, sourceLabel: source.label, outcome, reason, improvement });
      }
      items.push(...(accepted.length ? accepted : [gap ?? missingEvidence(task, dimension)]));
    }
    evidence[dimension] = items;
  }
  return { schema: 1, evidence };
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
