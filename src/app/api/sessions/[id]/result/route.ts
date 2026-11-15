import { json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';
import { scenario } from '@/lib/scenario';
import { claimsFor, DIMENSIONS, scoreTotal } from '@/lib/scoring';
import { cohortSessions, logEvent } from '@/lib/store';

// GET /api/sessions/:id/result -> the reveal. Only available once the session has reached the reveal state.
export const GET = withSession((s) => {
  requireState(s.state, 'reveal');
  const { nodes, suggestions } = s.data.result!;
  const claims = claimsFor(scenario, s.mode);
  const legacy = nodes.some((node) => !node.criterion);
  const peers = cohortSessions().filter((peer) => peer.mode === s.mode && peer.data.draftShownAt);
  const cohort = nodes.filter((node) => node.flawed && node.reveal).flatMap((node) => {
    const exposed = peers.filter((peer) => !peer.data.controlledClaimId || peer.data.controlledClaimId === node.id);
    if (exposed.length < 5) return [];
    const trusted = exposed.filter((peer) => peer.data.result?.nodes.some((item) => item.id === node.id && item.trustedError)).length;
    return [{ nodeId: node.id, pct: Math.round(100 * trusted / exposed.length), n: exposed.length }];
  });
  logEvent(s.id, 'reveal_view', {});
  return json({
    overall: scoreTotal(nodes),
    dimensions: DIMENSIONS.map((dimension) => ({ dimension, ...scoreTotal(nodes.filter((node) => node.dimension === dimension)) })),
    nodes: nodes.map((node) => ({
      ...node,
      statement: node.statement ?? (node.reveal ? claims.find((claim) => claim.id === node.id)?.text : undefined),
      evidence: !s.store && legacy && node.id === 'instruction' ? 'The original rubric checked your first instruction.' : node.evidence,
    })),
    suggestions,
    cohort,
    legacy,
  });
});
