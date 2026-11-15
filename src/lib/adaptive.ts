// Server-owned follow-up questions and bounds. Rubrics never enter the student view.
import { redactPII } from './guardrails';
import type { AdaptiveAction, AdaptiveFlow, AdaptiveTarget, Result, Scenario, SupportLevel } from './types';

type Question = { target: AdaptiveTarget; support: SupportLevel; text: string; criterion: string };
export const QUESTIONS: Record<string, Question> = {
  'basis-start': { target: 'basis', support: 'none', text: 'How would you verify the statement that 56% use AI weekly? Identify the source, calculation and people it describes.', criterion: 'Identifies the week 8 survey and 27 of 48 respondents, approximately 56%, rather than 56% of all 120 enrolled students.' },
  'basis-deepen': { target: 'basis', support: 'none', text: 'Who is represented by the week 9 quiz averages, and what limits applying them to the whole module?', criterion: 'Identifies survey respondents only, not the full cohort, and explains the limitation of non-response or selection.' },
  'basis-general': { target: 'basis', support: 'general', text: 'Revisit the weekly-use categories in the survey report. Which counts belong in the numerator and denominator, and why?', criterion: 'Explains that 27 weekly users out of 48 respondents gives approximately 56%; the denominator is respondents, not enrolled students.' },
  'basis-specific': { target: 'basis', support: 'specific', text: 'The report records 27 weekly users among 48 respondents, with 120 enrolled students. Explain how 56% is calculated and who it describes.', criterion: 'Explains 27 divided by 48, approximately 56%, and explicitly restricts the percentage to respondents.' },
  'uncertainty-start': { target: 'uncertainty', support: 'none', text: 'What can the three-point quiz gap tell us about AI and learning, and what can it not establish? Explain using the source pack.', criterion: 'Distinguishes an observed association from a causal effect and gives a relevant source-based reason, such as non-random groups, attendance differences or selection.' },
  'uncertainty-deepen': { target: 'uncertainty', support: 'none', text: 'What additional evidence or study design would strengthen a causal conclusion, and why is it needed?', criterion: 'Proposes a relevant comparison/design or control of confounding and explains how it addresses the causal limitation. Does not present proposed evidence as already collected.' },
  'uncertainty-general': { target: 'uncertainty', support: 'general', text: 'Compare how the two quiz groups were formed and whether they differed in other ways. How should that affect the conclusion?', criterion: 'Uses non-random assignment or a specific confounder to explain why the observed gap cannot establish that AI caused improved learning.' },
  'uncertainty-specific': { target: 'uncertainty', support: 'specific', text: 'Weekly users attended 7.1 seminars on average, versus 5.4 for others, and groups were not randomly assigned. How should this affect a claim that AI caused better learning?', criterion: 'Explains that attendance or self-selection is an alternative explanation, so this comparison cannot isolate an AI causal effect.' },
  'selection-start': { target: 'selection', support: 'none', text: 'Describe one choice you made about what to keep, change or leave out of your brief. Explain your reason using the task or sources.', criterion: 'States a specific personal choice about the brief and a coherent task- or source-grounded reason. Hypotheticals and general intentions alone do not meet this criterion.' },
  'selection-deepen': { target: 'selection', support: 'none', text: 'What evidence would make you revise that choice, and why?', criterion: 'Names a relevant condition or piece of evidence and explains why it would change the previous choice; does not merely repeat the choice.' },
  'selection-general': { target: 'selection', support: 'general', text: 'Choose one figure or conclusion in your brief. Say whether you kept, changed or excluded it, and explain how a source or requirement informed that choice.', criterion: 'Identifies a concrete personal inclusion/exclusion/revision decision and a relevant source or task reason.' },
  'selection-specific': { target: 'selection', support: 'specific', text: 'One option is to keep the observed quiz gap while avoiding a causal claim. State your own choice and explain why the method note supports or challenges it.', criterion: 'States an actual personal choice and explains the observational or confounding limitation. Merely agreeing with the suggested option is not enough.' },
};

export function startAdaptive(core: Result): AdaptiveFlow {
  return { status: 'preparing', core: structuredClone(core), turns: [], trace: [] };
}

export function acceptAction(flow: AdaptiveFlow, action: AdaptiveAction): AdaptiveFlow {
  if (action.action === 'escalate') { flow.status = 'review'; flow.reviewReason = 'The agents requested a human review.'; return flow; }
  if (action.action === 'finish') {
    if (!flow.turns.length || flow.turns.some(t => !t.answer)) throw new Error('Cannot finish unanswered follow-up');
    flow.status = 'complete'; return flow;
  }
  const q = QUESTIONS[action.questionId];
  const previous = flow.turns.at(-1);
  if (!q || flow.turns.length >= 2 || flow.turns.some(t => t.questionId === action.questionId) || (previous && !previous.answer)
    || (!previous && (!action.questionId.endsWith('-start') || q.support !== 'none'))
    || (previous && q.target !== previous.target)) throw new Error('Invalid adaptive question');
  flow.turns.push({ id: flow.turns.length + 1, questionId: action.questionId, target: q.target, support: q.support });
  flow.status = 'asking'; delete flow.candidate; return flow;
}

export function submitAdaptiveAnswer(flow: AdaptiveFlow, turnId: number, answer: string) {
  const turn = flow.turns.at(-1);
  if (flow.status !== 'asking' || !turn || turn.id !== turnId || turn.answer !== undefined || !answer.trim() || answer.length > 1000) throw new Error('Invalid or duplicate follow-up answer');
  turn.answer = answer.trim(); flow.status = 'preparing';
}

export function finishAdaptive(flow: AdaptiveFlow): Result {
  const calls = flow.trace.filter(t => t.role !== 'human');
  return { ...structuredClone(flow.core), followUp: {
    status: flow.status === 'unavailable' ? 'unavailable' : 'complete',
    turns: flow.turns.map(t => ({ id: t.id, target: t.target, support: t.support,
      outcome: t.verified ? t.observation?.outcome ?? 'unclear' : 'unclear',
      reviewed: t.human ? 'human' : t.verified ? 'automatic' : 'unresolved' })),
    calls: calls.length, latencyMs: calls.reduce((n, t) => n + t.ms, 0), inputTokens: calls.reduce((n,t) => n+t.inputTokens,0),
    outputTokens: calls.reduce((n,t) => n+t.outputTokens,0), humanReviewed: flow.trace.some(t => t.role === 'human'),
  } };
}


export function publicAdaptive(flow: AdaptiveFlow, scenario: Scenario) {
  const last = flow.turns.at(-1);
  return {
    status: flow.status, round: flow.turns.length, turnId: last?.id ?? null, support: last?.support ?? null,
    question: flow.status === 'asking' && last ? QUESTIONS[last.questionId].text : null,
    sources: scenario.pack.map(p => ({ title: p.title, body: redactPII(p.body, scenario.names).text })),
  };
}
