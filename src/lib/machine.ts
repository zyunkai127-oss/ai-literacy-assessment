// Session state machine. The server is the only place state changes.
import type { SessionState } from './types';

export const ORDER: SessionState[] = ['consent', 'intro', 'work', 'debrief', 'reveal'];

const NEXT: Record<SessionState, SessionState | null> = {
  consent: 'intro',
  intro: 'work',
  work: 'debrief',
  debrief: 'reveal',
  reveal: null,
};

export class StateError extends Error {}

/** Moves one step forward. Throws if the session is not in the expected state. */
export function advance(current: SessionState, expected: SessionState): SessionState {
  if (current !== expected) throw new StateError(`Expected state "${expected}" but session is in "${current}"`);
  const next = NEXT[current];
  if (!next) throw new StateError(`No state after "${current}"`);
  return next;
}

export function requireState(current: SessionState, expected: SessionState) {
  if (current !== expected) throw new StateError(`This action needs state "${expected}" but session is in "${current}"`);
}
