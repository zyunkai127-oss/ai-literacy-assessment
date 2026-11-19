import { expect, it } from 'vitest';
import { activityContext } from './activity-context';

it('preserves public station rows verbatim while masking student contact information', () => {
  const csv = 'EGGD,2024-10-01 00:50,10.00\nEGPH,2024-10-02 00:50,12.00';
  const prompt = activityContext([csv], 'Contact me at 07700 900123', 'student@example.com');
  expect(prompt.system).toBe(csv);
  expect(prompt.studentWork).toContain('[number removed]');
  expect(prompt.studentWork).toContain('[email removed]');
  expect(prompt.studentWork).not.toMatch(/07700|student@example/);
});
