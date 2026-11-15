// Pure scoring functions. Specification: docs/01_scoring_spec.md. No I/O.
// Only server code passes in the scenario, which holds the answer key. Never import this file from a client component.
import { redactPII } from './guardrails';
import type {
  Band, Claim, ClaimCode, ClaimReview, DecideItem, Declared, DiscernType, Incident, Mode,
  Observations, OwnCheck, Result, Scenario, Thresholds, VivaKind,
} from './types';

// ---------- text helpers ----------

export const NEGATION = /\b(not|no|cannot|can't|doesn't|don't|unclear|whether|without|unproven|false|wrong|incorrect|invented|unverified|unapproved|unsupported|fabricated|absent)\b/i;
/** Narrower test for statements whose wording is not itself a hedge: only an explicit rejection of the statement discounts a match. */
const REJECTION = /\b(wrong|incorrect|false|invented|fabricated|fake|made up|unverified|unapproved|unsupported|absent|not on the|(?:does not|doesn't) exist|not (?:65|sixty))\b/i;
const clauses = (text: string) => text.split(/(?<=[.!?])\s+|(?<=[.!?]["”])\s+|[;\n]+|\b(?:but|however|rather than)\b/i).filter(Boolean);

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** First matched text for any pattern. With a skip pattern, the text is split into clauses and clauses matching it are ignored. */
export function findMarker(text: string, patterns: string[], skip: RegExp | null = null): string | null {
  for (const part of skip ? clauses(text) : [text]) {
    if (skip && skip.test(part)) continue;
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

/** Share of the brief's four-word phrases that also occur in any assistant reply. */
export function overlap(brief: string, ...replies: string[]): number {
  const grams = (text: string) => {
    const words = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
    return words.slice(3).map((_, i) => words.slice(i, i + 4).join(' '));
  };
  const briefGrams = grams(brief);
  const assistantGrams = new Set(replies.flatMap(grams));
  return briefGrams.length ? briefGrams.filter((phrase) => assistantGrams.has(phrase)).length / briefGrams.length : 0;
}

export function instructionFeatures(text: string) {
  return {
    topic: /\b(ai(?: tools?)?|artificial intelligence|learn\w*|modules?|surveys?|first[- ]year)\b/i.test(text),
    length: /\b(words?|paragraphs?|short|brief|sentences?|concise)\b/i.test(text),
    sources: /\b(sources?|cite|citations?|references?|evidence|data|figures?|statistics?)\b/i.test(text),
    audience: /\b(supervisor|committee|tutor|lecturer|audience)\b/i.test(text),
  };
}

// ---------- supported facts in the source pack (for data points and attribution) ----------

const SURVEY = /\b(survey|module report)\b/i;
const QUIZ = /\bquiz\b/i;
const METHOD = /\b(quiz|method note)\b/i;

export const FACTS = [
  { label: 'survey response count or rate', source: SURVEY, context: /respond|respons|enrolled|answered/i, marker: /\b48\s*(?:of|out of|\/)\s*(?:the )?120\b|\b48\s+(?:survey\s+)?(?:responses?|replies)\s+from\s+(?:the\s+)?120\s+(?:enrolled\s+)?students\b|\b40\s?(?:%|per ?cent\b)/i },
  { label: 'weekly AI use', source: SURVEY, context: /week(?:ly|\b)|regularly/i, marker: /\b27\s*(?:of|out of|\/)\s*(?:the )?48\b|\b56\s?(?:%|per ?cent\b)/i },
  { label: 'weekly users asking for explanations', source: SURVEY, context: /explain|explanation/i, marker: /\b19\s*(?:of|out of|\/)\s*(?:the )?27\b|\b70\s?(?:%|per ?cent\b)/i },
  { label: 'weekly users asking for answers', source: SURVEY, context: /answers?/i, marker: /\b8\s*(?:of|out of|\/)\s*(?:the )?27\b|\b8\s+(?:mainly\s+)?(?:ask|asked)\s+(?:the AI\s+)?for answers\b/i },
  { label: 'respondents never shown how to check AI', source: SURVEY, context: /shown|train|taught|how to check|guidance/i, marker: /\b41\s*(?:of|out of|\/)\s*(?:the )?48\b|\b85\s?(?:%|per ?cent\b)/i },
  { label: 'weekly AI users’ quiz mean', source: QUIZ, context: /quiz|mean|averag|scor/i, marker: /\b27\.5\b/ },
  { label: 'other respondents’ quiz mean', source: QUIZ, context: /quiz|mean|averag|scor/i, marker: /\b24\.5\b/ },
  { label: 'quiz score difference', source: QUIZ, context: /quiz|scor|higher|lower|differ|gap|advantage/i, marker: /\b3[- ]points?\b|\bthree[- ]point(?:s? (?:ahead|higher|lower|more|less|behind)| (?:gap|difference|advantage))\b/i },
  { label: 'weekly AI users’ seminar attendance', source: METHOD, context: /seminar|attend/i, marker: /\b7\.1\b/ },
  { label: 'other respondents’ seminar attendance', source: METHOD, context: /seminar|attend/i, marker: /\b5\.4\b/ },
];

/** Supported facts that count as using a correct statement, or as correcting a wrong one. */
const CLAIM_FACTS: Record<string, string[]> = {
  c1: ['survey response count or rate'],
  c2: ['weekly AI use'],
  c4: ['weekly AI users’ quiz mean', 'other respondents’ quiz mean', 'quiz score difference'],
  c5: ['respondents never shown how to check AI'],
  c6: ['weekly users asking for explanations'],
};

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+|(?<=[.!?]["”])\s+|[;\n]+/);
function factSentences(text: string, fact: typeof FACTS[number]) {
  return sentencesOf(text).filter((sentence) => fact.context.test(sentence) && fact.marker.test(sentence));
}
function claimFactHit(text: string, claimId: string): string | null {
  for (const fact of FACTS.filter((f) => (CLAIM_FACTS[claimId] ?? []).includes(f.label))) {
    const sentence = factSentences(text, fact)[0];
    if (sentence) return fact.marker.exec(sentence)![0];
  }
  return null;
}

/** An explicit rejection written in the chat, such as "the 65% figure is wrong" or "I'll leave out the Marlowe study". Questions and reported speech do not count. */
function chatRejected(claim: Claim, messages: string[]): boolean {
  const markers = claim.role === 'signal' ? claim.error_markers : claim.keep_markers;
  return messages.some((text) => clauses(text).some((part) => {
    if (part.includes('?') || !findMarker(part, markers)) return false;
    const declaresWrong = !/\b(said|says|thinks?|claims?|if)\b|["“”]/i.test(part)
      && /\b(?:is|are|was|were|looks?|seems?) (?:wrong|incorrect|fabricated|made up|fake|false|not right)\b/i.test(part);
    const omits = /\bi(?: (?:will|am going to)|['’]ll) (?:omit|drop|exclude|leave out|not use)\b|\bi (?:removed|excluded|left out|dropped|won'?t use|won'?t cite)\b/i.test(part);
    return declaresWrong || (claim.role === 'signal' && omits);
  }));
}

// ---------- 5. disposition coding ----------

export function codeClaims(s: Scenario, o: Observations): ClaimCode[] {
  if (!o.draftShown) return [];
  return claimsFor(s, o.mode).map((c) => {
    const used = c.role === 'signal'
      // Spec §4.1: hedged or negated clauses are discounted only for statements marked negation_ok (c4). For the others, only an explicit rejection is.
      ? findMarker(o.brief, c.error_markers, c.negation_ok ? NEGATION : REJECTION)
      : findMarker(o.brief, c.keep_markers) ?? claimFactHit(o.brief, c.id);
    const fixed = c.role === 'signal' && !used ? findMarker(o.brief, c.fixed_markers ?? []) ?? claimFactHit(o.brief, c.id) : null;
    const flagged = o.flagged.includes(c.id);
    const chat = chatRejected(c, o.studentMessages);
    const queried = o.queried.includes(c.id);
    const code: ClaimCode = {
      id: c.id, role: c.role, used, fixed, flagged, chatRejected: chat, queried,
      leastSure: o.leastSure.includes(c.id), checkedAt: o.openedAt[c.section] ?? null,
      ladder: null, sdt: null, d1: null,
    };
    if (c.role === 'signal') {
      const suspicion = queried || flagged || chat || !!fixed;
      if (used && !suspicion) Object.assign(code, { ladder: 0, sdt: 'MISS' });
      else if (used) Object.assign(code, { ladder: 1, sdt: 'HIT', d1: 'fail' });
      else if (suspicion) Object.assign(code, { ladder: 2, sdt: 'HIT', d1: 'success' });
    } else if (flagged || chat) code.sdt = 'FA';
    else if (used) code.sdt = 'CR';
    return code;
  });
}

// ---------- 6.1 Discern ----------

const TYPE_LABEL: Record<DiscernType, string> = { CALIBRATED: 'Calibrated', SCEPTICAL: 'Sceptical', CREDULOUS: 'Credulous', MISPLACED: 'Misplaced' };

export function discern(s: Scenario, codes: ClaimCode[], t: Thresholds): Result['discern'] {
  const count = (x: string) => codes.filter((c) => c.sdt === x).length;
  const [hits, misses, fas, crs] = [count('HIT'), count('MISS'), count('FA'), count('CR')];
  if (hits + misses < 2 || fas + crs < 1) return { status: 'insufficient', hits, misses, fas, crs };
  const H = (hits + 0.5) / (hits + misses + 1);
  const F = (fas + 0.5) / (fas + crs + 1);
  const hiH = H >= t.H_HIGH;
  const hiF = F >= t.F_HIGH;
  const type: DiscernType = hiH ? (hiF ? 'SCEPTICAL' : 'CALIBRATED') : (hiF ? 'MISPLACED' : 'CREDULOUS');
  return { status: 'ok', type, label: TYPE_LABEL[type], meaning: s.reveal[`type_${type}`], H, F, hits, misses, fas, crs };
}

// ---------- 6.2 Decide ----------

/** 90% equal-tailed intervals of Beta(0.5 + s, 0.5 + f), precomputed with scipy.stats.beta.ppf. Key: "s,f". */
export const BETA_Q: Record<string, [number, number]> = {
  '0,1': [0.002, 0.771], '0,2': [0.001, 0.569], '0,3': [0.001, 0.444], '0,4': [0.000, 0.362], '0,5': [0.000, 0.306], '0,6': [0.000, 0.264],
  '1,0': [0.229, 0.998], '1,1': [0.097, 0.903], '1,2': [0.062, 0.764], '1,3': [0.046, 0.651], '1,4': [0.036, 0.563], '1,5': [0.030, 0.495], '1,6': [0.026, 0.440],
  '2,0': [0.431, 0.999], '2,1': [0.236, 0.938], '2,2': [0.165, 0.835], '2,3': [0.128, 0.739], '2,4': [0.104, 0.659], '2,5': [0.088, 0.593], '2,6': [0.076, 0.538],
  '3,0': [0.556, 0.999], '3,1': [0.349, 0.954], '3,2': [0.261, 0.872], '3,3': [0.209, 0.791], '3,4': [0.175, 0.719], '3,5': [0.150, 0.657], '3,6': [0.132, 0.604],
  '4,0': [0.638, 1.000], '4,1': [0.437, 0.964], '4,2': [0.341, 0.896], '4,3': [0.281, 0.825], '4,4': [0.239, 0.761], '4,5': [0.209, 0.703], '4,6': [0.185, 0.653],
  '5,0': [0.694, 1.000], '5,1': [0.505, 0.970], '5,2': [0.407, 0.912], '5,3': [0.343, 0.850], '5,4': [0.297, 0.791], '5,5': [0.262, 0.738], '5,6': [0.235, 0.690],
  '6,0': [0.736, 1.000], '6,1': [0.560, 0.974], '6,2': [0.462, 0.924], '6,3': [0.396, 0.868], '6,4': [0.347, 0.815], '6,5': [0.310, 0.765], '6,6': [0.280, 0.720],
};

/** Share of the statements in the brief that were sound: correct ones used plus wrong ones corrected. Null when the brief uses none. */
function accuracy(codes: ClaimCode[]): number | null {
  const sound = codes.filter((c) => (c.role === 'decoy' && c.used) || (c.role === 'signal' && c.fixed)).length;
  const total = codes.filter((c) => c.used || c.fixed).length;
  return total ? sound / total : null;
}

export function decide(s: Scenario, o: Observations, codes: ClaimCode[], t: Thresholds, e1: string | null): Result['decide'] {
  const title = (id: string) => s.claims.find((c) => c.id === id)!.title;
  const items: DecideItem[] = [];
  for (const c of codes.filter((x) => x.d1)) {
    const how = c.queried ? 'you asked the assistant about it' : c.chatRejected ? 'you said in the chat that it was wrong' : c.flagged ? 'you said you did not rely on it' : 'you noticed a problem';
    items.push({ id: 'D1', claimId: c.id, outcome: c.d1!, evidence: c.d1 === 'success'
      ? `"${title(c.id)}": ${how}, and it is not in your brief.`
      : `"${title(c.id)}": ${how}, but your brief still includes "${c.used}".` });
  }
  const shipped = codes.filter((c) => c.role === 'signal' && c.used);
  if (shipped.length) {
    const named = shipped.some((c) => c.leastSure);
    items.push({ id: 'D3', outcome: named ? 'success' : 'fail', evidence: named
      ? 'A wrong statement in your brief was among the points you said you were least sure about.'
      : 'None of the wrong statements in your brief were among the points you said you were least sure about.' });
  }
  const acc = accuracy(codes);
  if (acc !== null) {
    const over = o.confidence - acc;
    const total = codes.filter((c) => c.used || c.fixed).length;
    items.push({ id: 'D4', outcome: over < t.OVERCONF ? 'success' : 'fail',
      evidence: `You said you were ${Math.round(o.confidence * 100)}% confident. ${Math.round(acc * total)} of the ${total} statement(s) from the assistant's summary that your brief relies on were sound.` });
  }
  const sCount = items.filter((i) => i.outcome === 'success').length;
  const fCount = items.length - sCount;
  if (items.length < t.DECIDE_MIN_ITEMS) return { status: 'insufficient', items };
  const mean = (sCount + 0.5) / (items.length + 1);
  let band: Band = mean >= t.BAND_PROFICIENT ? 'Proficient' : mean >= t.BAND_DEVELOPING ? 'Developing' : 'Emerging';
  const ci = BETA_Q[`${Math.min(sCount, 6)},${Math.min(fCount, 6)}`];
  const capped = !!e1 && band === 'Proficient';
  if (capped) band = 'Developing';
  return { status: 'ok', band, mean, ci, wide: ci[1] - ci[0] > t.WIDE_CI, capped, items };
}

/** Share of the brief's wording that matches the paragraph the assistant wrote after its offer was accepted. */
export const offerOverlap = (o: Observations) => (o.p2Accepted && o.offerParagraph ? overlap(o.brief, o.offerParagraph) : 0);
/** Accepting the offer only counts against the student when that wording ends up in the submitted brief. */
export const usedOfferParagraph = (o: Observations, t: Thresholds) => o.p2Accepted && (!o.offerParagraph || offerOverlap(o) >= t.OVERLAP_MIXED);

// ---------- 8. incidents ----------

export function incidents(s: Scenario, o: Observations, codes: ClaimCode[], t: Thresholds) {
  const e1 = codes.find((c) => c.role === 'signal' && c.used && !c.leastSure && o.confidence >= t.CONFIDENT)?.id ?? null;
  const namesInBrief = redactPII(o.brief, s.names).names;
  const leaked = new Set([...o.namesToAI, ...namesInBrief]).size;
  const list: Incident[] = [];
  if (e1) list.push('E1');
  if (leaked >= 2) list.push('E2');
  if (usedOfferParagraph(o, t)) list.push('E3');
  return { list, e1, leaked, namesInBrief: namesInBrief.length };
}

// ---------- 6.3 Own ----------

const measuredBand = (ov: number, t: Thresholds): Declared => (ov < t.OVERLAP_MIXED ? 'MINE' : ov < t.OVERLAP_AI ? 'MIXED' : 'AI');
const RANK: Record<Declared, number> = { MINE: 0, MIXED: 1, AI: 2 };
const DECLARED_TEXT: Record<Declared, string> = { MINE: 'mostly yours', MIXED: 'about half yours', AI: 'mostly the assistant’s' };

export function own(s: Scenario, o: Observations, codes: ClaimCode[], t: Thresholds, inc: ReturnType<typeof incidents>): OwnCheck[] {
  const check = (id: OwnCheck['id'], title: string, ok: boolean | null, evidence: string): OwnCheck =>
    ({ id, title, ok, evidence, reveal: s.reveal[id], advice: s.advice[id] });
  const hasView = studentView(s, o.brief);
  const sawComments = o.openedAt.comments !== undefined || hasView || o.draftShown;
  const ov = overlap(o.brief, ...o.assistantReplies);
  const measured = measuredBand(ov, t);
  return [
    check('O1', 'Classmates’ personal data',
      inc.leaked ? false : sawComments ? true : null,
      inc.leaked ? `${o.namesToAI.length} classmate name(s) reached the assistant and ${inc.namesInBrief} appeared in your brief.`
        : sawComments ? 'No classmate names reached the assistant or your brief.' : 'You did not work with the survey comments.'),
    check('O2', 'Writing the final paragraph yourself',
      usedOfferParagraph(o, t) || o.ghostRequested ? false : o.p2Shown ? true : null,
      usedOfferParagraph(o, t) ? `You accepted the assistant’s offer to write the final paragraph, and ${Math.round(offerOverlap(o) * 100)}% of your brief’s four-word phrases match what it wrote.`
        : o.p2Accepted ? `You accepted the assistant’s offer to write the final paragraph, but the brief you handed in is in your own words (${Math.round(offerOverlap(o) * 100)}% matches what it wrote).`
        : o.ghostRequested ? 'You asked the assistant to write the finished brief.'
          : o.p2Shown ? 'The assistant offered to write the final paragraph and you did not take it up.' : 'The offer did not come up in this session.'),
    check('O3', 'Describing your AI use accurately',
      o.assistantReplies.length ? RANK[o.declared] >= RANK[measured] : null,
      `You said the wording was ${DECLARED_TEXT[o.declared]}. ${Math.round(ov * 100)}% of your brief’s four-word phrases match the assistant’s replies.`),
    check('O4', 'Errors in the work you handed in',
      o.draftShown ? !codes.some((c) => c.role === 'signal' && c.used) : null,
      codes.some((c) => c.role === 'signal' && c.used)
        ? `Your brief includes ${codes.filter((c) => c.role === 'signal' && c.used).map((c) => `"${c.used}"`).join(', ')}.`
        : 'None of the assistant’s wrong statements are in your brief.'),
  ];
}

// ---------- 7. follow-up question ----------

export function selectViva(s: Scenario, o: Observations, codes: ClaimCode[], t: Thresholds): { kind: VivaKind; claimId: string | null; question: string } {
  const title = (id: string) => s.claims.find((c) => c.id === id)!.title;
  const e1 = incidents(s, o, codes, t).e1;
  if (e1) return { kind: 'confident_wrong', claimId: e1, question: `You wrote "${codes.find((c) => c.id === e1)!.used}" in your brief. What did you base that on?` };
  const fas = codes.filter((c) => c.sdt === 'FA');
  const fa = fas.find((c) => s.claims.find((x) => x.id === c.id)?.lure) ?? fas[0];
  if (fa) return { kind: 'false_alarm', claimId: fa.id, question: `You decided not to rely on "${title(fa.id)}". What made you doubt it?` };
  const hit = codes.find((c) => c.role === 'signal' && c.ladder === 2 && (c.flagged || c.chatRejected));
  if (hit) return { kind: 'hit', claimId: hit.id, question: `You decided not to rely on "${title(hit.id)}". What made you doubt it?` };
  return { kind: 'generic', claimId: null, question: 'How did you decide what to keep from the assistant’s summary?' };
}

const REASON = /\b(because|since|source|survey|list|data|checked|looked|read|evidence|method|figure|number)\b/i;

export function rateViva(kind: VivaKind, claim: Claim | null, answer: string): 0 | 1 | 2 {
  const reason = wordCount(answer) >= 5 && REASON.test(answer);
  if (kind === 'generic' || !claim) return reason ? 1 : 0;
  const normalised = answer.replace(/\bout of\b/gi, 'of');
  if (reason && findMarker(normalised, claim.basis_markers)) return 2;
  return reason ? 1 : 0;
}

// ---------- 6.5 work quality (reported separately, not part of the profile) ----------

function studentView(s: Scenario, brief: string): boolean {
  // Match the four source-comment themes, with attribution or a direct quotation.
  // A mention of a student alone is not evidence of a reported view.
  const attributed = /\b(?:(?:one|a|another) (?:survey )?(?:student|respondent|participant|commenter)|(?:students?|respondents?|participants?|commenters?) (?:said|say|wrote|reported|commented)|survey (?:comments?|responses?))\b/i;
  const themes = [
    /\b(?:explain(?:s|ing|ed)?|explanations?|clarif(?:y|ies|ying|ied)|understand(?:ing)?)\b.{0,60}\b(?:slides?|course materials?|lecture materials?)\b/i,
    /\b(?:check(?:s|ing|ed)?|verif(?:y|ies|ying|ied))\b.{0,50}\btextbooks?\b/i,
    /^(?=.*\bpast(?:e|es|ed|ing)\b.{0,50}\b(?:questions?|prompts?)\b)(?=.*\b(?:edit|polish|tidy|tidies|tidied|tidying)\w*\b.{0,30}\b(?:answers?|responses?)\b)/i,
    /\b(?:referenc(?:ing|e)|citation)\b.{0,40}\b(?:wrong|incorrect|error|mistake)\b|\b(?:wrong|incorrect|error|mistake)\b.{0,40}\b(?:referenc(?:ing|e)|citation)\b/i,
    /\b(?:los(?:t|ing)|deducted)\b.{0,20}\bmarks?\b.{0,60}\b(?:AI|referenc\w*|citation)\b/i,
  ];
  const specificMarkers = s.view_markers.filter((pattern) => !/student/i.test(pattern));
  return sentencesOf(brief.replace(/\s+/g, ' ').trim()).some((part) => {
    if (/\b(?:no (?:survey )?(?:comments?|students?|respondents?)|denies|denied)\b/i.test(part) || /\?\s*$/.test(part) || /\b(?:imagine|hypothetical|invented quote|fabricated quote|made.up quote)\b/i.test(part)
      || /\b(?:do not|did not|does not|didn't|doesn't|don't)\s+(?:say|report|describe|mention)\b/i.test(part) || /\b(?:should|must|ought to)\b/i.test(part)
      || /\b(?:does not|did not|doesn't|didn't|never)\s+(?:use|ask|check|paste|lose|find|help)\b/i.test(part)) return false;
    const quoted = /["“][^"”]+["”]/.test(part);
    if (!attributed.test(part) && !quoted) return false;
    const nightView = /\b(?:late at night|late[- ]night|middle of the night)\b|\b1\s*(?:am\b|a\.m\.)/i.test(part)
      && /\b(?:AI|assistant)\b/i.test(part) && /\b(?:help|stuck|use|using|turn|support|ask)\w*\b/i.test(part);
    return !!findMarker(part, specificMarkers) || themes.some((theme) => theme.test(part)) || nightView;
  });
}

export function quality(s: Scenario, o: Observations, t: Thresholds): Result['quality'] {
  const found = FACTS.map((fact) => ({ fact, sentences: factSentences(o.brief, fact) })).filter((x) => x.sentences.length);
  const attributed = found.filter(({ fact, sentences }) => sentences.some((x) => fact.source.test(x))).length;
  const words = wordCount(o.brief);
  const hasView = studentView(s, o.brief);
  const sourced = found.length > 0 && attributed === found.length;
  const wordsOK = words >= t.WORDS_MIN && words <= t.WORDS_MAX;
  return { words, validPoints: found.length, attributed, hasView, sourced, wordsOK, onTime: o.onTime,
    met: found.length >= 2 && hasView && sourced && wordsOK && o.onTime };
}

// ---------- per-statement review ----------

function review(s: Scenario, c: ClaimCode): ClaimReview {
  const claim = s.claims.find((x) => x.id === c.id)!;
  const section = s.pack.find((p) => p.id === claim.section)?.title ?? claim.section;
  const parts: string[] = [];
  if (c.used) parts.push(`Your brief includes "${c.used}".`);
  else if (c.fixed) parts.push(`Your brief uses the corrected figure ("${c.fixed}").`);
  else parts.push('This statement is not in your brief.');
  if (c.queried) parts.push('You asked the assistant about it.');
  if (c.chatRejected) parts.push(claim.role === 'signal' ? 'In the chat you said it was wrong or that you would leave it out.' : 'In the chat you said it was wrong.');
  if (c.flagged) parts.push('At the debrief you said you did not rely on it.');
  if (c.leastSure) parts.push('You listed it among the points you were least sure about.');
  parts.push(c.checkedAt !== null ? `You opened "${section}" at ${mmss(c.checkedAt)}.` : `You did not open "${section}".`);
  return {
    ...c, title: claim.title, text: claim.text, flawed: claim.role === 'signal',
    criterion: claim.role === 'signal'
      ? 'Discern records whether you questioned, rejected or corrected this statement. Decide checks whether you then kept the error out of your brief. Questioning it while still submitting it shows doubt without successful action. Opening a source on its own does not count, and nor does silently leaving it out.'
      : 'This statement was correct. Using it counts in your favour. Saying you did not rely on it counts as a false alarm. Asking about it does not count against you.',
    evidence: parts.join(' '), reveal: claim.reveal_text, advice: claim.advice,
  };
}

// ---------- 9. headline and suggestions ----------

function headline(s: Scenario, o: Observations, reviews: ClaimReview[], inc: ReturnType<typeof incidents>): Result['headline'] {
  if (inc.e1) {
    const r = reviews.find((x) => x.id === inc.e1)!;
    return { kind: 'E1', claimId: r.id,
      happened: `${r.evidence} At the debrief you said you were ${Math.round(o.confidence * 100)}% confident your brief was accurate, and this was not among the points you were least sure about.`,
      means: r.reveal, next: r.advice };
  }
  if (inc.list.includes('E2')) return { kind: 'E2', claimId: null, happened: `${inc.leaked} classmates’ names reached the assistant or your brief.`, means: s.reveal.O1, next: s.advice.O1 };
  if (inc.list.includes('E3')) return { kind: 'E3', claimId: null, happened: 'You accepted the assistant’s offer to write the final paragraph and handed in its wording.', means: s.reveal.E3, next: s.advice.O2 };
  const best = reviews.find((r) => r.ladder === 2 && r.queried) ?? reviews.find((r) => r.ladder === 2 && r.fixed) ?? reviews.find((r) => r.ladder === 2);
  if (best) return { kind: 'best_call', claimId: best.id, happened: `Your best call: "${best.title}". ${best.evidence}`, means: best.reveal,
    next: 'Keep doing this when the stakes are real, not only when you know someone is watching.' };
  return { kind: 'none', claimId: null, happened: s.reveal.none, means: 'There was little evidence of checking or of being misled.', next: s.advice.none };
}

function suggestions(s: Scenario, r: Omit<Result, 'suggestions' | 'headline'>, reviews: ClaimReview[], inc: ReturnType<typeof incidents>): string[] {
  const out: string[] = [];
  if (inc.e1) out.push(reviews.find((x) => x.id === inc.e1)!.advice);
  if (inc.list.includes('E2')) out.push(s.advice.O1);
  if (inc.list.includes('E3')) out.push(s.advice.O2);
  if (r.discern.status === 'ok' && r.discern.type !== 'CALIBRATED') out.push(s.advice[`type_${r.discern.type}`]);
  for (const item of r.decide.items.filter((i) => i.outcome === 'fail')) out.push(s.advice[item.id]);
  for (const c of r.own.checks.filter((x) => x.ok === false)) out.push(c.advice);
  for (const c of reviews.filter((x) => x.sdt === 'MISS')) out.push(c.advice);
  const unique = [...new Set(out.filter(Boolean))].slice(0, 3);
  if (!unique.length && r.discern.status === 'insufficient') return [s.advice.none];
  return unique.length ? unique : ['You handled every point in this session well. Try the same habits on a real assignment, where nobody has warned you.'];
}

// ---------- composition ----------

export function scoreSession(s: Scenario, o: Observations): Result {
  const t = s.thresholds;
  const codes = codeClaims(s, o);
  const inc = incidents(s, o, codes, t);
  const reviews = codes.map((c) => review(s, c));
  const vivaClaim = o.viva?.claimId ? s.claims.find((c) => c.id === o.viva!.claimId) ?? null : null;
  const partial = {
    discern: discern(s, codes, t),
    decide: decide(s, o, codes, t, inc.e1),
    own: {
      checks: own(s, o, codes, t, inc),
      viva: o.viva ? { ...o.viva, answer: o.quoteText ? o.viva.answer : '', rating: rateViva(o.viva.kind, vivaClaim, o.viva.answer) } : null,
    },
    direct: { features: instructionFeatures(o.firstInstruction), instruction: o.firstInstruction ? (o.quoteText ? o.firstInstruction.slice(0, 160) : '') : null },
    quality: quality(s, o, t),
    incidents: inc.list,
    claims: reviews,
  };
  return { ...partial, headline: headline(s, o, reviews, inc), suggestions: suggestions(s, partial, reviews, inc) };
}
