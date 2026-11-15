import { fail, json } from '@/lib/api';
import { reviewAuthorized } from '@/lib/ops-auth';
import { pendingAdaptiveSessions } from '@/lib/store';
import { scenario } from '@/lib/scenario';
import { redactPII } from '@/lib/guardrails';
import { QUESTIONS } from '@/lib/adaptive';
export const dynamic = 'force-dynamic';
export function GET(req: Request) {
  if (!reviewAuthorized(req)) return fail(401, 'Teacher access is required.');
  return json({ reviews: pendingAdaptiveSessions().map(s => {
    const f = s.data.adaptive!;
    const last = f.turns.at(-1);
    return { id: s.id, brief: redactPII(s.data.brief ?? '', scenario.names).text, reason: f.reviewReason, core: f.core.collaboration, trace: f.trace,
      turns: f.turns.map(t => ({ ...t, question: QUESTIONS[t.questionId].text, criterion: QUESTIONS[t.questionId].criterion })),
      choices: Object.entries(QUESTIONS).filter(([id, q]) => f.turns.length < 2 && !f.turns.some(t => t.questionId === id) && (last ? q.target === last.target : id.endsWith('-start'))).map(([id, q]) => ({ id, text: q.text, support: q.support })),
    };
  }), sources: scenario.pack.map(p => ({ title: p.title, body: redactPII(p.body, scenario.names).text })) });
}
