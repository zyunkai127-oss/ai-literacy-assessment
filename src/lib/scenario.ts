// Server only. Holds the answer key. Never import this from a client component.
import raw from '../../data/scenario.json';
import { claimsFor } from './scoring';
import type { Mode, Scenario } from './types';

export const scenario = raw as unknown as Scenario;

/** What the browser is allowed to see before the reveal: no markers, no flags, no reveal text. */
export function publicScenario(mode: Mode) {
  return {
    notice: scenario.meta.notice,
    timeLimit: scenario.time_limit_s[mode],
    task: scenario.task,
    pack: scenario.pack,
    teammateDelay: mode === 'full' ? scenario.teammate.delay_s : null,
  };
}

export function publicClaims(mode: Mode) {
  return claimsFor(scenario, mode).map((c) => ({ id: c.id, text: c.text }));
}

/** The assistant's first answer, built verbatim from the pre-written statements (never rewritten by a model). */
export function draftText(mode: Mode) {
  const body = claimsFor(scenario, mode).map((c) => c.text).join(' ');
  return `${scenario.draft_intro}\n\n${body}\n\n${scenario.draft_outro}`;
}
