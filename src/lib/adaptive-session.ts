import { runAdaptive } from './adaptive-runner';
import { createAdaptiveAgents } from './adaptive-agents';
import { finishAdaptive } from './adaptive';
import { finishSession, logEvent, saveSession } from './store';
import { scenario } from './scenario';
import type { Session } from './types';

export function completeAdaptiveSession(s: Session) {
  s.state = 'reveal';
  finishSession(s, finishAdaptive(s.data.adaptive!));
}

export async function continueAdaptiveSession(s: Session) {
  const flow = s.data.adaptive!;
  const previousTraces = flow.trace.length;
  await runAdaptive(flow, createAdaptiveAgents(scenario, s.data.brief ?? ''), () => saveSession(s));
  for (const trace of flow.trace.slice(previousTraces)) logEvent(s.id, 'adaptive_agent', trace);
  logEvent(s.id, 'adaptive_state', { status: flow.status, rounds: flow.turns.length });
  if (flow.status === 'complete') completeAdaptiveSession(s);
  else saveSession(s);
}
