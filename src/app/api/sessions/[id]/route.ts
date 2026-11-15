import { json, withSession } from '@/lib/api';
import { llmAvailable } from '@/lib/llm';
import { publicScenario } from '@/lib/scenario';

// GET /api/sessions/:id -> the session as the browser may see it. Never includes the answer key.
export const GET = withSession((s) =>
  json({
    id: s.id, state: s.state, mode: s.mode, store: s.store,
    scenario: publicScenario(s.mode),
    startedAt: s.startedAt, serverNow: Date.now(),
    messages: s.data.messages,
    brief: s.data.brief ?? '',
    liveModel: llmAvailable(),
  }),
);
