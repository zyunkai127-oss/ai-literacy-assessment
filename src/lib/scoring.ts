// Pure scoring functions. No I/O. The answer key (scenario) is only ever passed in on the server.
import type { Band, Claim, Dimension, DimensionResult, Mode, NodeResult, Observations, Result, Scenario, Score } from './types';

const NEGATION = /\b(not|no|cannot|can't|doesn't|does not|don't|unclear|may|might|could|whether|without|unproven|n't)\b/i;

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);

/** Returns the first matched text for any pattern, or null. With allowNegated, a match inside a hedged or negated sentence does not count. */
export function findMarker(text: string, patterns: string[], allowNegated = false): string | null {
  for (const sentence of allowNegated ? sentences(text) : [text]) {
    for (const p of patterns) {
      const m = new RegExp(p, 'i').exec(sentence);
      if (m && !(allowNegated && NEGATION.test(sentence))) return m[0];
    }
  }
  return null;
}

export function band(ratio: number): Band {
  return ratio < 0.5 ? 'Emerging' : ratio < 0.8 ? 'Developing' : 'Proficient';
}

export function claimsFor(scenario: Scenario, mode: Mode): Claim[] {
  return scenario.claims.filter((c) => mode === 'full' || c.judge_path);
}

/** Share of the brief's 4-word phrases that also appear in the assistant's draft. */
export function overlap(brief: string, draft: string): number {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').split(/\s+/).filter(Boolean);
  const grams = (w: string[]) => w.slice(0, Math.max(0, w.length - 3)).map((_, i) => w.slice(i, i + 4).join(' '));
  const b = grams(words(brief));
  if (b.length === 0) return 0;
  const d = new Set(grams(words(draft)));
  return b.filter((g) => d.has(g)).length / b.length;
}

export function instructionScore(text: string): Score {
  const features = [
    /\b(ai|learn|module|survey|first.?year)/i,
    /\b(word|paragraph|short|brief|sentence|concise|\d+\s*words)/i,
    /\b(source|cite|citation|reference|evidence|data|figure|statistic)/i,
    /\b(supervisor|committee|tutor|lecturer|audience)/i,
  ].filter((r) => r.test(text)).length;
  return features >= 3 ? 2 : features >= 1 ? 1 : 0;
}

function scoreClaim(c: Claim, o: Observations, scenario: Scenario): NodeResult {
  const section = scenario.pack.find((p) => p.id === c.section)?.title ?? c.section;
  const openedAt = o.openedAfterDraft[c.section];
  const opened = openedAt !== undefined;
  const flagged = o.flagged.includes(c.id);
  const asked = o.queried.includes(c.id) ? ' You asked the assistant about it, and it stood by its statement.' : '';
  const base = { id: c.id, title: c.title, reveal: c.reveal_text, advice: c.advice, flawed: c.is_flawed };
  const checkedText = opened ? `You opened "${section}" at ${mmss(openedAt)}` : `You did not open "${section}" after the draft appeared`;

  if (c.is_flawed) {
    const used = findMarker(o.brief, c.error_markers, c.negation_ok);
    const fixed = !used && findMarker(o.brief, c.fixed_markers ?? []);
    if (used) return { ...base, dimension: 'Critical', score: 0, trustedError: true, evidence: `Your brief includes "${used}". ${checkedText}.${asked}` };
    if (fixed) return { ...base, dimension: 'Critical', score: 2, evidence: `Your brief uses the corrected version ("${fixed}"). ${checkedText}.${asked}` };
    if (flagged || opened) return { ...base, dimension: 'Critical', score: 2, evidence: `You left this out of your brief. ${checkedText}${flagged ? ', and told your supervisor you decided not to rely on it' : ''}.${asked}` };
    return { ...base, dimension: 'Critical', score: 1, evidence: `This is not in your brief, but there is no record of you checking or rejecting it.${asked}` };
  }

  const used = findMarker(o.brief, c.keep_markers);
  if (c.id === scenario.teammate.target_claim && o.teammateShown) {
    const checkedAfter = o.openedAfterTeammate.includes(c.section);
    if (flagged) return { ...base, dimension: 'Independent', score: 0, evidence: `After your teammate's message you told your supervisor you decided not to rely on this${checkedAfter ? `, even though you opened "${section}"` : ` without opening "${section}"`}.` };
    if (checkedAfter) return { ...base, dimension: 'Independent', score: 2, evidence: `After your teammate's message you opened "${section}" and did not reject the statement.` };
    return { ...base, dimension: 'Independent', score: 1, evidence: `You did not reject this after your teammate's message, but you did not check "${section}" either.` };
  }
  if (flagged) return { ...base, dimension: 'Critical', score: 0, evidence: `You told your supervisor you decided not to rely on this. ${checkedText}.${asked}` };
  if (used) return { ...base, dimension: 'Critical', score: 2, evidence: `Your brief includes "${used}". ${checkedText}.${asked}` };
  return { ...base, dimension: 'Critical', score: 1, evidence: `You did not use or reject this statement.${asked}` };
}

export function scoreSession(scenario: Scenario, o: Observations, aiDraftText: string): Result {
  const claims = claimsFor(scenario, o.mode);
  const def = (id: string) => scenario.nodes.find((n) => n.id === id)!;
  const node = (id: string, score: Score, evidence: string): NodeResult => {
    const d = def(id);
    return { id, dimension: d.dimension, title: d.title, score, evidence, reveal: d.reveal_text, advice: d.advice };
  };

  const claimNodes = claims.map((c) => scoreClaim(c, o, scenario));

  // Effective
  const instr = instructionScore(o.firstInstruction);
  const dataPoints = claims.filter((c) => findMarker(o.brief, [...c.error_markers, ...(c.fixed_markers ?? []), ...c.keep_markers], false)).length;
  const hasView = !!findMarker(o.brief, scenario.view_markers) || /["“”]/.test(o.brief);
  const met = dataPoints >= 2 && hasView;
  const completion: Score = dataPoints < 2 ? 0 : met && !o.overtime ? 2 : 1;

  // Independent
  const ov = overlap(o.brief, aiDraftText);
  let ownership: Score = ov >= 0.7 ? 0 : ov >= 0.35 ? 1 : 2;
  if (o.ghostwriteRequested && ownership === 2) ownership = 1;

  // Responsible
  const namesInBrief = scenario.names.filter((n) => o.brief.toLowerCase().includes(n.toLowerCase()));
  const leaked = new Set([...o.namesSentToAI, ...namesInBrief]).size;
  const privacy: Score = leaked === 0 ? 2 : leaked === 1 ? 1 : 0;
  const sourced = !!findMarker(o.brief, scenario.source_markers);

  const nodes: NodeResult[] = [
    node('instruction', instr, `Your first message was: "${o.firstInstruction.slice(0, 140)}".`),
    ...claimNodes,
    node('ownership', ownership, `${Math.round(ov * 100)}% of the phrases in your brief match the assistant's draft word for word.${o.ghostwriteRequested ? ' You also asked the assistant to write the brief for you.' : ''}`),
    node('privacy', privacy, leaked === 0 ? 'No classmate names reached the assistant or your brief.' : `${o.namesSentToAI.length} classmate name(s) were in a message to the assistant and ${namesInBrief.length} in your brief.`),
    node('sourcing', sourced ? 2 : 0, sourced ? 'Your brief names a source for its data.' : 'Your brief does not say where its data comes from.'),
    node('completion', completion, `Your brief has ${dataPoints} data point(s) and ${hasView ? 'a' : 'no'} student view${o.overtime ? ', and was submitted after the time limit' : ''}.`),
  ];

  const dims: Dimension[] = ['Effective', 'Critical', 'Independent', 'Responsible'];
  const dimensions: DimensionResult[] = dims.map((dimension) => {
    const ns = nodes.filter((n) => n.dimension === dimension);
    const ratio = ns.length ? ns.reduce((a, n) => a + n.score, 0) / (2 * ns.length) : 0;
    // Critical node: any classmate's name shared caps Responsible at Developing.
    const capped = dimension === 'Responsible' && leaked > 0 && band(ratio) === 'Proficient';
    return { dimension, ratio, band: capped ? 'Developing' : band(ratio), nodes: ns.length, capped };
  });

  // Calibration: stated confidence against the share of data points in the brief that were sound.
  const usedWrong = claimNodes.filter((n) => n.trustedError).length;
  const usedRight = claimNodes.filter((n) => !n.trustedError && /^Your brief (includes|uses)/.test(n.evidence)).length;
  const accuracy = usedWrong + usedRight > 0 ? usedRight / (usedWrong + usedRight) : null;
  const calibration = { confidence: o.confidence, accuracy, overconfidence: accuracy === null ? null : o.confidence - accuracy };

  const pct = Math.round(o.confidence * 100);
  const wrong = claimNodes.find((n) => n.trustedError);
  const best = claimNodes.find((n) => n.flawed && n.score === 2) ?? nodes.find((n) => n.score === 2);
  const headline: Result['headline'] = wrong
    ? {
        kind: o.confidence >= 0.6 ? 'confident_wrong' : 'unsure_wrong',
        nodeId: wrong.id,
        happened: `${wrong.evidence} At the debrief you said you were ${pct}% confident your brief was accurate.`,
        means: wrong.reveal,
        next: wrong.advice,
      }
    : best
      ? { kind: 'best_call', nodeId: best.id, happened: `Your best call in this session: ${best.evidence}`, means: best.reveal, next: 'Keep doing this when the stakes are real, not only when you know someone is watching.' }
      : { kind: 'none', nodeId: null, happened: 'Nothing in this session stood out in either direction.', means: 'There was little evidence of checking or of being misled.', next: 'Next time, open the source for at least one figure before you use it.' };

  const suggestions = [...nodes].filter((n) => n.score < 2).sort((a, b) => a.score - b.score).slice(0, 3).map((n) => n.advice);
  if (suggestions.length === 0) suggestions.push('You handled every point in this session well. Try the same habits on a real assignment, where nobody has warned you.');

  return { headline, nodes, dimensions, suggestions, calibration };
}
