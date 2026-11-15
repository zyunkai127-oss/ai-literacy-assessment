// Pure scoring functions. Only server callers pass in the scenario answer key.
import { redactPII } from './guardrails';
import type { Claim, Dimension, Mode, NodeResult, Observations, Result, Scenario, Score, ScoreTotal } from './types';

const NEGATION = /\b(not|no|cannot|can't|doesn't|don't|unclear|whether|without|unproven|false|wrong|incorrect|invented|unverified|unapproved|unsupported|fabricated|absent)\b/i;
const clauses = (text: string) => text.split(/(?<=[.!?])\s+|[;\n]+|\b(?:but|however|rather than)\b/i).filter(Boolean);

export function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Returns the first marker. For error markers, skip clauses which qualify or reject the claim. */
export function findMarker(text: string, patterns: string[], allowNegated = false): string | null {
  for (const part of allowNegated ? clauses(text) : [text]) {
    if (allowNegated && NEGATION.test(part)) continue;
    for (const pattern of patterns) {
      const match = new RegExp(pattern, 'i').exec(part);
      if (match) return match[0];
    }
  }
  return null;
}

export function claimsFor(scenario: Scenario, mode: Mode): Claim[] {
  return scenario.claims.filter((claim) => mode === 'full' || claim.judge_path);
}

/** Share of the brief's four-word phrases that also occur in an assistant reply. */
export function overlap(brief: string, ...replies: string[]): number {
  const grams = (text: string) => {
    const words = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
    return words.slice(3).map((_, i) => words.slice(i, i + 4).join(' '));
  };
  const briefGrams = grams(brief);
  const assistantGrams = new Set(replies.flatMap(grams));
  return briefGrams.length ? briefGrams.filter((phrase) => assistantGrams.has(phrase)).length / briefGrams.length : 0;
}

export function instructionScore(text: string): Score {
  const features = [
    /\b(ai(?: tools?)?|artificial intelligence|learn\w*|modules?|surveys?|first[- ]year)\b/i,
    /\b(words?|paragraphs?|short|brief|sentences?|concise)\b/i,
    /\b(sources?|cite|citations?|references?|evidence|data|figures?|statistics?)\b/i,
    /\b(supervisor|committee|tutor|lecturer|audience)\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  return features >= 3 ? 2 : features >= 1 ? 1 : 0;
}

function scoreClaim(claim: Claim, o: Observations, scenario: Scenario): NodeResult {
  const teammate = claim.id === scenario.teammate.target_claim && o.teammateAt !== undefined;
  const section = scenario.pack.find((item) => item.id === claim.section)!.title;
  const openedAt = o.openedAfterDraft[claim.section];
  const asked = o.queried.includes(claim.id) ? ' You asked the assistant about this statement.' : '';
  const opened = openedAt !== undefined ? ` You opened “${section}” ${Math.floor(openedAt)} seconds into the session, after the assistant’s statement.` : '';
  const factLabels = CLAIM_FACTS[claim.id] ?? [];
  const correct = FACTS.some((fact) => factLabels.includes(fact.label) && factSentences(o.brief, fact).length);
  const error = findMarker(o.brief, claim.error_markers, true);
  const removed = claim.is_flawed && o.revisions.some((draft) => findMarker(draft, claim.error_markers, true));
  const rejected = o.studentMessages.some((message) => (!teammate || message.ts > o.teammateAt!) && clauses(message.text).some((part) => {
    const markers = claim.is_flawed ? claim.error_markers : claim.keep_markers;
    const declaresWrong = !/\b(said|says|thinks?|claims?|if)\b|["“”]/i.test(part) && /\b(?:is|are|was|were) (?:wrong|incorrect|fabricated|made up)\b/i.test(part);
    const decisionToOmit = /\bi(?: (?:will|am going to)|['’]ll) (?:omit|drop|exclude|leave out)\b|\bi (?:removed|excluded|left out|dropped|won't use|won't cite)\b/i.test(part);
    return !!findMarker(part, markers) && !part.includes('?') && (declaresWrong || (claim.is_flawed && decisionToOmit));
  }));
  const exposed = o.exposedClaimIds.includes(claim.id);
  const base = {
    id: claim.id,
    ...(exposed ? { statement: claim.text } : {}),
    title: claim.title,
    reveal: claim.id === scenario.teammate.target_claim && !teammate ? claim.reask_text : claim.reveal_text.split(' If asked')[0],
    advice: claim.advice,
    flawed: claim.is_flawed,
    dimension: (teammate ? 'Independent' : 'Critical') as Dimension,
    criterion: teammate
      ? '2 points for reopening the source after the teammate message and retaining the supported figure, 0 for explicitly rejecting it as incorrect.'
      : claim.is_flawed
        ? '2 points for a supported correction or rejecting an error after opening its source, 1 for a recorded rejection or removal, 0 for including the error as a claim.'
        : '2 points for retaining the supported figure, 0 for explicitly rejecting it as incorrect.',
  };

  if (!exposed && !teammate) return { ...base, score: null, reveal: '', evidence: 'This statement did not appear in your session.' };
  if (!claim.is_flawed && !correct && rejected) {
    return { ...base, score: 0, evidence: `A chat message explicitly called this supported figure incorrect.${opened}` };
  }
  if (teammate) {
    if (correct && o.openedAfterTeammate.includes(claim.section)) {
      return { ...base, score: 2, evidence: `You opened “${section}” after the teammate message and kept the supported figure.` };
    }
    return { ...base, score: null, evidence: `The teammate message appeared, with no recorded combination of a source check and a final decision to keep the figure.${asked}` };
  }
  if (error) return { ...base, score: 0, trustedError: true, evidence: `Your final brief includes the scripted error.${opened}${asked}` };
  if (correct) return { ...base, score: 2, evidence: removed
    ? `An earlier editor snapshot included the scripted error and your final brief uses the supported figure.${opened}${asked}`
    : `Your final brief uses a supported figure for this claim.${opened}${asked}` };
  if (rejected) return { ...base, score: openedAt !== undefined ? 2 : 1, evidence: `A chat message explicitly rejected this scripted claim, and your final brief leaves it out.${opened}` };
  if (removed) return { ...base, score: openedAt !== undefined ? 2 : 1, evidence: `An earlier editor snapshot contained the scripted error. Your final brief leaves it out.${opened}${asked}` };
  return { ...base, score: null, evidence: `The final brief leaves out this claim. The session recorded no decision to revise or retain it.${opened}${asked}` };
}

// Count each supported fact once, including figures available only in the source pack.
const SURVEY = /\b(survey|module report)\b/i;
const QUIZ = /\bquiz\b/i;
const METHOD = /\b(quiz|method note)\b/i;

const FACTS = [
  { label: 'survey response count or rate', source: SURVEY, context: /respond|respons|enrolled|answered/i, marker: /\b48\s*(?:of|out of|\/)\s*(?:the )?120\b|\b40\s?(?:%|per ?cent\b)/i },
  { label: 'weekly AI use', source: SURVEY, context: /week(?:ly|\b)|regularly/i, marker: /\b27\s*(?:of|out of|\/)\s*(?:the )?48\b|\b56\s?(?:%|per ?cent\b)/i },
  { label: 'weekly users asking for explanations', source: SURVEY, context: /explain|explanation/i, marker: /\b19\s*(?:of|out of|\/)\s*(?:the )?27\b|\b70\s?(?:%|per ?cent\b)/i },
  { label: 'weekly users asking for answers', source: SURVEY, context: /answers?/i, marker: /\b8\s*(?:of|out of|\/)\s*(?:the )?27\b|\b8\s+(?:mainly\s+)?(?:ask|asked)\s+(?:the AI\s+)?for answers\b/i },
  { label: 'respondents never shown how to check AI', source: SURVEY, context: /shown|train|taught|how to check|guidance/i, marker: /\b41\s*(?:of|out of|\/)\s*(?:the )?48\b|\b85\s?(?:%|per ?cent\b)/i },
  { label: 'weekly AI users’ quiz mean', source: QUIZ, context: /quiz|mean|averag|scor/i, marker: /\b27\.5\b/ },
  { label: 'other respondents’ quiz mean', source: QUIZ, context: /quiz|mean|averag|scor/i, marker: /\b24\.5\b/ },
  { label: 'quiz score difference', source: QUIZ, context: /quiz|scor|higher|lower|differ|gap|advantage/i, marker: /\b3[- ]points?\b/i },
  { label: 'weekly AI users’ seminar attendance', source: METHOD, context: /seminar|attend/i, marker: /\b7\.1\b/ },
  { label: 'other respondents’ seminar attendance', source: METHOD, context: /seminar|attend/i, marker: /\b5\.4\b/ },
];

const CLAIM_FACTS: Record<string, string[]> = {
  c1: ['survey response count or rate'],
  c2: ['weekly AI use'],
  c4: ['weekly AI users’ quiz mean', 'other respondents’ quiz mean', 'quiz score difference'],
  c5: ['respondents never shown how to check AI'],
  c6: ['weekly users asking for explanations'],
};

function factSentences(text: string, fact: typeof FACTS[number]) {
  return text.split(/(?<=[.!?])\s+|[;\n]+/)
    .filter((sentence) => fact.context.test(sentence) && fact.marker.test(sentence));
}

export const DIMENSIONS: Dimension[] = ['Effective', 'Critical', 'Independent', 'Responsible'];

export function scoreTotal(nodes: NodeResult[]): ScoreTotal {
  const observed = nodes.filter((node) => node.score !== null);
  const earned = observed.reduce((total, node) => total + (node.score ?? 0), 0);
  const possible = observed.length * 2;
  return { earned, possible, percentage: possible ? Math.round(100 * earned / possible) : null };
}

export function scoreSession(scenario: Scenario, o: Observations): Result {
  const node = (id: string, score: Score | null, evidence: string, criterion: string): NodeResult => {
    const definition = scenario.nodes.find((item) => item.id === id)!;
    return { id, dimension: definition.dimension, title: definition.title, score, evidence, criterion, reveal: definition.reveal_text, advice: definition.advice };
  };
  const found = FACTS.map((fact) => ({ fact, sentences: factSentences(o.brief, fact) })).filter((item) => item.sentences.length);
  const missingSources = found.filter(({ fact, sentences }) => !sentences.some((sentence) => fact.source.test(sentence)));
  const hasView = clauses(o.brief).some((part) => {
    const view = findMarker(part, scenario.view_markers);
    return !!view && (!/^(?:one|a) student$|^students? (?:said|wrote|reported|commented|told)$/i.test(view)
      || wordCount(part.slice(part.indexOf(view) + view.length)) >= 3);
  });
  const words = wordCount(o.brief);
  const completion: Score = found.length < 2 ? 0 : hasView && words >= 80 && words <= 150 && !o.overtime ? 2 : 1;

  const phraseOverlap = overlap(o.brief, ...o.assistantReplies);
  const ownership: Score | null = !o.assistantReplies.length && !o.ghostwriteRequested ? null
    : phraseOverlap >= 0.7 ? 0 : phraseOverlap >= 0.35 || o.ghostwriteRequested ? 1 : 2;
  const namesInBrief = redactPII(o.brief, scenario.names).names;
  const shared = new Set([...o.namesSentToAI, ...namesInBrief]).size;
  const privacy: Score | null = shared >= 2 ? 0 : shared === 1 ? 1 : o.commentsOpened || hasView ? 2 : null;

  const nodes = [
    node('instruction', o.firstInstruction ? instructionScore(o.firstInstruction) : null,
      o.firstInstruction ? (o.quoteInstruction ? `Your first message was “${o.firstInstruction.slice(0, 140)}”.` : 'The rubric checked your first message for topic, format, sources and audience.') : 'You did not send a task instruction to the assistant.',
      '2 points for at least three of topic, format, sources and audience, 1 for one or two, 0 for none.'),
    ...claimsFor(scenario, o.mode).map((claim) => scoreClaim(claim, o, scenario)),
    node('ownership', ownership, ownership === null ? 'There was no assistant reply or request to write the finished brief to assess.'
      : `${Math.round(phraseOverlap * 100)}% of your brief’s four-word phrases match assistant replies.${o.ghostwriteRequested ? ' You requested a finished brief.' : ''}`,
      '2 points below 35% phrase overlap, 1 from 35% to below 70%, 0 at 70% or more. Requesting a finished brief limits this to 1 point.'),
    node('privacy', privacy, shared ? `${o.namesSentToAI.length} classmate name(s) were redacted from chat and ${namesInBrief.length} appeared in the final brief.`
      : privacy === null ? 'There was no recorded use of the survey comments or sharing of classmate names.' : 'You worked with the survey comments without including classmate names in chat or the brief.',
      '2 points for keeping names private when using the comments, 1 for sharing one classmate name, 0 for sharing two or more.'),
    node('sourcing', !found.length ? null : !missingSources.length ? 2 : missingSources.length < found.length ? 1 : 0,
      !found.length ? 'No supported data point was recognised to assess its attribution.'
        : `The source was named alongside ${found.length - missingSources.length} of ${found.length} recognised data point(s).${missingSources.length ? ` Missing attribution for ${missingSources.map(({ fact }) => fact.label).join(', ')}.` : ''}`,
      '2 points for naming the source alongside all recognised points, 1 for some, 0 for none.'),
    node('completion', completion, `Your brief has ${words} words, ${found.length} recognised data point(s) and ${hasView ? 'a' : 'no recognised'} student view. It was submitted ${o.overtime ? 'after the time limit' : 'within the time limit'}.`,
      '2 points for at least two supported data points, a student view, 80–150 words and on-time submission. 1 point for two data points with another requirement missed, 0 for fewer than two.'),
  ];
  const missed = nodes.filter((item) => item.score !== null && item.score < 2)
    .sort((a, b) => Number(!!b.trustedError) - Number(!!a.trustedError) || (a.score ?? 0) - (b.score ?? 0));
  const suggestions = [...new Set(missed.map((item) => item.advice))].slice(0, 3);
  if (!suggestions.length) {
    const strength = nodes.find((item) => item.flawed && item.score === 2) ?? nodes.find((item) => item.score === 2);
    if (strength) suggestions.push(`${strength.evidence} ${strength.advice}`);
  }
  return { nodes, suggestions };
}
