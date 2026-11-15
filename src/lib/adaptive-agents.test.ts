import { describe, expect, it } from 'vitest';
import { parseObservation } from './adaptive-agents';
describe('observer evidence validation', () => {
  it('accepts grounded evidence and rejects fabricated quotations', () => {
    expect(parseObservation({ outcome: 'met', signal: 'accurate', evidence: 'non-random groups' }, 'The non-random groups differ.').outcome).toBe('met');
    expect(() => parseObservation({ outcome: 'met', signal: 'accurate', evidence: 'random allocation' }, 'The groups differ.')).toThrow();
  });
  it('does not accept a positive conclusion with no evidence or a conflicting signal', () => {
    expect(() => parseObservation({ outcome: 'met', signal: 'accurate', evidence: '' }, 'Yes')).toThrow();
    expect(() => parseObservation({ outcome: 'met', signal: 'ambiguous', evidence: 'Yes' }, 'Yes')).toThrow();
    expect(parseObservation({ outcome: 'unclear', signal: 'ambiguous', evidence: '' }, '').outcome).toBe('unclear');
  });
});
