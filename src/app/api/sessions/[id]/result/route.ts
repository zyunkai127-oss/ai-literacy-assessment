import { json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { claimsFor } from '@/lib/scoring';
import { cohortSessions, logEvent } from '@/lib/store';

const MIN_COHORT = 5;

// GET /api/sessions/:id/result -> the reveal. Only available once the session has reached the reveal state.
export const GET = withSession((s) => {
  requireState(s.state, 'reveal');
  const result = s.data.result!;
  const peers = cohortSessions().filter((p) => p.mode === s.mode && p.data.result);
  const cohort = peers.length < MIN_COHORT ? [] : result.nodes.filter((n) => n.flawed).map((n) => {
    const trusted = peers.filter((p) => p.data.result!.nodes.find((x) => x.id === n.id)?.trustedError).length;
    return { nodeId: n.id, pct: Math.round((100 * trusted) / peers.length), n: peers.length };
  });
  logEvent(s.id, 'reveal_view', {});
  return json({
    mode: s.mode,
    result,
    cohort,
    statements: claimsFor(scenario, s.mode).map((c) => ({ id: c.id, text: c.text, flawed: c.is_flawed })),
    brief: s.data.brief ?? '',
    notice: scenario.meta.notice,
  });
});
