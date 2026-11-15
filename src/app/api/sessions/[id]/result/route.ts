import { json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { claimsFor } from '@/lib/scoring';
import { cohortSessions, logEvent } from '@/lib/store';

// GET /api/sessions/:id/result -> the reveal. Only available once the session has reached the reveal state.
// There is no overall score and no per-dimension number: the internal rates behind the Discern type and the Decide band are not sent.
export const GET = withSession((s) => {
  requireState(s.state, 'reveal');
  const result = s.data.result!;
  const { H: _h, F: _f, ...discern } = result.discern;
  const { mean: _mean, ci: _ci, ...decide } = result.decide;
  const shown = result.claims.length > 0;

  // Group comparison: of today's consenting, finished sessions in the same version, how many handed in each wrong statement.
  const peers = cohortSessions().filter((peer) => peer.mode === s.mode && (peer.data.result?.claims.length ?? 0) > 0);
  const cohort = peers.length < 5 ? [] : result.claims.filter((c) => c.flawed).map((c) => ({
    claimId: c.id,
    shipped: peers.filter((peer) => peer.data.result!.claims.some((x) => x.id === c.id && x.used)).length,
    n: peers.length,
  }));
  logEvent(s.id, 'reveal_view', {});
  return json({
    ...result, discern, decide, cohort,
    statements: shown ? claimsFor(scenario, s.mode).map((c) => ({ id: c.id, text: c.text, wrong: c.role === 'signal' })) : [],
    notice: scenario.meta.notice,
  });
});
