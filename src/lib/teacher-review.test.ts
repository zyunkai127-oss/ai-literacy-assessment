import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createSession, finishSession, getSession, saveSession, updatePendingReview } from './store';
import { acceptAction, startAdaptive, submitAdaptiveAnswer } from './adaptive';
import { resolveAdaptiveReview } from './adaptive-runner';
import type { Result } from './types';

beforeAll(() => vi.stubEnv('DB_PATH', ':memory:'));
afterAll(() => {
  const local = globalThis as { __alcDb?: DatabaseSync };
  local.__alcDb?.close();
  delete local.__alcDb;
  vi.unstubAllEnvs();
});

it('accepts only the first decision on the displayed round, including after a second pause and no-store cleanup', () => {
  const s = createSession('full', false);
  const core = { incidents: [], discern: { status: 'na' }, decide: { status: 'na' } } as unknown as Result;
  const flow = startAdaptive(core);
  s.state = 'viva'; s.data.adaptive = flow; s.data.brief = 'private draft';
  acceptAction(flow, { action: 'ask', reason: 'probe', questionId: 'basis-start' });
  submitAdaptiveAnswer(flow, 1, 'First answer');
  flow.status = 'review'; saveSession(s);
  expect(updatePendingReview(s.id, 1, current => {
    resolveAdaptiveReview(current.data.adaptive!, { action: 'ask', questionId: 'basis-general', outcome: 'unclear' });
    saveSession(current);
  })).toBe(true);
  const stale = vi.fn();
  expect(updatePendingReview(s.id, 1, stale)).toBe(false);

  const second = getSession(s.id)!;
  submitAdaptiveAnswer(second.data.adaptive!, 2, 'Second answer');
  second.data.adaptive!.status = 'review'; saveSession(second);
  expect(updatePendingReview(s.id, 1, stale)).toBe(false);
  const finish = () => updatePendingReview(s.id, 2, current => {
    current.state = 'reveal';
    finishSession(current, core);
  });
  expect(finish()).toBe(true);
  expect(updatePendingReview(s.id, 2, stale)).toBe(false);
  expect(stale).not.toHaveBeenCalled();
  expect(getSession(s.id)?.state).toBe('reveal');
  expect(getSession(s.id)?.data.brief).toBeUndefined();
});
