// Server only. Holds the answer key. Never import this from a client component.
import raw from '../../data/scenario.json';
import type { Mode, Scenario } from './types';

export const scenario = raw as unknown as Scenario;

/** What the browser is allowed to see before the reveal: no markers, no flags, no reveal text. */
export function publicScenario(mode: Mode) {
  return {
    notice: scenario.meta.notice,
    timeLimit: scenario.time_limit_s[mode],
    task: scenario.task,
    pack: scenario.pack,
  };
}

export const isGreeting = (text: string) => /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|你好|嗨)[!！.,，。\s]*$/i.test(text.trim());
