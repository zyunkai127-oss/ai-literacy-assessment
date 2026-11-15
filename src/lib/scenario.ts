// Server only. Holds the answer key. Never import this from a client component.
import raw from '../../data/scenario.json';
import { claimsFor } from './scoring';
import type { Mode, Scenario } from './types';

export const scenario = raw as unknown as Scenario;

export const isEvidence = (section: string) => scenario.evidence_sections.includes(section);

/** What the browser may see before the reveal. Evidence sources are titles only: their text is released one at a time, within the budget. */
export function publicScenario(mode: Mode) {
  return {
    notice: scenario.meta.notice,
    timeLimit: scenario.time_limit_s[mode],
    task: scenario.task,
    pack: scenario.pack.map((p) => (isEvidence(p.id) ? { id: p.id, title: p.title, locked: true } : { id: p.id, title: p.title, body: p.body, locked: false })),
    budget: scenario.budget[mode],
    budgetNote: scenario.budget_note,
    offerDelay: scenario.ghostwrite_offer.delay_s[mode],
  };
}

export const evidenceBody = (section: string) => scenario.pack.find((p) => p.id === section)?.body ?? '';

export function publicClaims(mode: Mode) {
  return claimsFor(scenario, mode).map((c) => ({ id: c.id, text: c.text }));
}

/** The assistant's research summary, built verbatim from the pre-written statements (never rewritten by a model). */
export function draftText(mode: Mode) {
  const body = claimsFor(scenario, mode).map((c) => c.text).join(' ');
  return `${scenario.draft_intro}\n\n${body}\n\n${scenario.draft_outro}`;
}

export const isGreeting = (text: string) => /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|你好|嗨)[!！.,，。\s]*$/i.test(text.trim());
