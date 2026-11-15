import { completeAdaptiveSession } from '@/lib/adaptive-session';
import { teacherReviewConfigured } from '@/lib/ops-auth';
import { publicAdaptive } from '@/lib/adaptive';
import { json, withSession } from '@/lib/api';
import { llmAvailable } from '@/lib/llm';
import { evidenceBody, openedEvidence, publicClaims, publicScenario, scenario } from '@/lib/scenario';

// GET /api/sessions/:id -> the session as the browser may see it. Never includes the answer key:
// no roles, markers or reveal text, and evidence text only for the sources this session has opened.
export const GET = withSession((s) => {
  // Recover sessions checkpointed immediately before reveal by earlier versions.
  if (s.state === 'viva' && s.data.adaptive?.status === 'complete') completeAdaptiveSession(s);
  const d = s.data;
  const opened = openedEvidence(d.opens);
  return json({
    id: s.id, state: s.state, mode: s.mode, store: s.store,
    scenario: publicScenario(s.mode),
    startedAt: s.startedAt, serverNow: Date.now(),
    messages: d.messages.map(({ role, text, ts, claims }) => ({ role, text, ts, ...(claims ? { claims } : {}) })),
    brief: d.brief ?? '',
    claims: d.draftShownAt ? publicClaims(s.mode) : [],
    draftShownAt: d.draftShownAt ?? null,
    offerShown: !!d.p2ShownAt,
    opened: Object.fromEntries(opened.map((id) => [id, evidenceBody(id)])),
    remaining: Math.max(0, scenario.budget[s.mode] - opened.length),
    guideOnly: d.ghostwrite,
    viva: s.state === 'viva' && d.viva ? { question: d.viva.question } : null,
    adaptive: s.state === 'viva' && d.adaptive ? { ...publicAdaptive(d.adaptive, scenario), teacherAvailable: teacherReviewConfigured() } : null,
    liveModel: llmAvailable(),
  });
});
