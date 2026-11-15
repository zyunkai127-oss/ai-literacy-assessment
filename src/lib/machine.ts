// Session state machine. The server is the only place state changes.
import type { SessionState } from './types';

const ALLOWED: Record<SessionState, SessionState[]> = {
  consent: ['intro'],
  intro: ['work'],
  work: ['debrief'],
  debrief: ['viva', 'reveal'], // The follow-up question (viva) runs in the full version only.
  viva: ['reveal'],
  reveal: [],
};

export class StateError extends Error {}

/** Moves forward one step. Throws if the session is not in the expected state or the move is not allowed. */
export function advance(current: SessionState, expected: SessionState, to?: SessionState): SessionState {
  if (current !== expected) throw new StateError(`Expected state "${expected}" but session is in "${current}"`);
  const next = to ?? ALLOWED[current][0];
  if (!next || !ALLOWED[current].includes(next)) throw new StateError(`Cannot move from "${current}" to "${to}"`);
  return next;
}

export function requireState(current: SessionState, expected: SessionState) {
  if (current !== expected) throw new StateError(`This action needs state "${expected}" but session is in "${current}"`);
}
