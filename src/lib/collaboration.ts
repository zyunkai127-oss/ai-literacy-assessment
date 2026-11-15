// Server-only, rule-based observations of live collaboration. No overall score.
import { scoreSession } from './scoring';
import type { CollaborationCheck, Observations, Result, Scenario, VivaRecord, Msg } from './types';

// Evaluate the student's own prose, excluding quoted material and pasted code.
const prose = (text: string) => text.replace(/```[\s\S]*?```/g, '').replace(/^>.*$/gm, '')
  .replace(/"[^"\n]*"|“[^”]*”/g, '').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const parts = (text: string) => prose(text).split(/(?<=[.!?;])\s+|\b(?:but|however|yet)\b/i).map((part) => part.trim()).filter(Boolean);
const taskTopic = /\b(brief|paragraph|wording|claim|conclusion|comparison|figure|number|source|citation|sentence|suggestion|quote|evidence|data|point|method|interpretation)s?\b/i;

function requests(text: string): string[] {
  return parts(text).filter((part) => !/\b(don't|do not|will not|won't|not asking|no need)\b/i.test(part)
    && /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\b|help|explain|clarify|compare|plan|outline|organise|organize|summari[sz]e|give|suggest|show|identify|trace|cite|check|review|evaluate|assess|verify|find|tell|look|confirm)\b|^(?:which|where|why|how|what|does|is|can)\b/i.test(part));
}
const asksForDirection = (text: string) => requests(text).some((part) => /\b(explain|clarify|compar[ei]|plan|outline|structure|feedback|summari[sz]e|organise|organize|mean|meaning)\b/i.test(part));
const asksForBasis = (text: string) => requests(text).some((part) => /\b(sources?|evidence|denominator|numerator|original|causation|causal|observational|references?|report|method|calculat\w*)\b/i.test(part)
  || /\bwhere\b.{0,60}\bcome from\b/i.test(part) && /\d|figure|number/i.test(part));
const asksForReview = (text: string) => requests(text).some((part) => /\b(check|review|evaluate|assess|verify|look over)\b/i.test(part)
  && /\b(requirements?|brief|draft|paragraph|sources?|word count|criteria)\b/i.test(part));

function reasonedChoice(text: string): boolean {
  return parts(text).some((part) => /^(?:i|we)\b/i.test(part)
    && !/\b(?:if|would|might|haven't decided|have not decided|did not decide)\b/i.test(part)
    && /\b(keep|kept|change|changed|revise|revised|retain|retained|omit|omitted|leave out|left out|reject|rejected|exclude|excluded|remove|removed|use|using|include|included|chose|choose|decided)\b/i.test(part)
    && /\b(because|since|therefore|based on|as|due to|so that)\b/i.test(part) && taskTopic.test(part));
}

/** A request is evidence only after the next assistant reply, not an earlier or scripted reply. */
function answeredMessages(messages: Msg[]): string[] {
  const answered: string[] = [];
  let pending: string | null = null;
  for (const message of messages) {
    if (message.blocked) continue;
    if (message.role === 'user') pending = message.text;
    else if (pending !== null) {
      if (!message.scripted && !message.failed) answered.push(pending);
      pending = null;
    }
  }
  return answered;
}

export function reviewFollowThrough(messages: Msg[]): boolean {
  let requested = false;
  let replied = false;
  for (const message of messages) {
    if (message.blocked) continue;
    if (message.role === 'user') {
      if (replied && reasonedChoice(message.text)) return true;
      if (asksForReview(message.text)) { requested = true; replied = false; }
    } else if (requested) {
      replied = !message.scripted && !message.failed;
      requested = false;
    }
  }
  return false;
}

function causalWording(brief: string) {
  let limited = false;
  let strong = false;
  for (const part of parts(brief)) {
    const text = part.replace(/\bnot only\b/gi, '');
    const limitation = /\b(observational|correlation|confound\w*|self.selected)\b|\b(?:cannot|can't|does not|doesn't|do not|don't)\s+(?:establish|conclude|prove|infer|show|imply)\b|\bassociation rather than causation\b/i.exec(text);
    if (limitation && !/\b(?:not|no|isn't|aren't|is not|are not)\s+(?:a\s+)?$/i.test(text.slice(0, limitation.index))) limited = true;
    if (!/\b(ai|artificial intelligence|weekly users)\b/i.test(text) || !/\b(learn\w*|scores?|grades?|performance|outcomes?)\b/i.test(text)) continue;
    const assertion = /\b(proves?|causes?|caused|leads? to|results? in)\b|\bAI(?: tools?)?\s+(?:improves?|boosts?|raises?|enhances?)\b/i.exec(text);
    if (assertion && !/\b(cannot|can't|can not|does not|doesn't|do not|don't|not|may|might|could)\b.{0,45}$/i.test(text.slice(0, assertion.index))) strong = true;
  }
  return { limited, strong };
}

/** Exclude wording shared with supplied sources or already written by the student. */
function distinctiveOverlap(s: Scenario, o: Observations): number {
  const grams = (text: string) => {
    const words = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
    return words.slice(3).map((_, i) => words.slice(i, i + 4).join(' '));
  };
  const shared = new Set(grams([...s.pack.map((p) => p.body), s.task.prompt, ...s.task.requirements].join(' ')));
  const assistant = new Set<string>();
  if (o.conversation) {
    for (const message of o.conversation) {
      if (message.blocked || message.failed || message.scripted) continue;
      for (const phrase of grams(message.text)) {
        if (message.role === 'user') shared.add(phrase);
        else if (!shared.has(phrase)) assistant.add(phrase);
      }
    }
  } else {
    for (const reply of o.assistantReplies) for (const phrase of grams(reply)) if (!shared.has(phrase)) assistant.add(phrase);
  }
  const brief = grams(o.brief);
  const matches = brief.filter((phrase) => assistant.has(phrase)).length;
  return matches >= 8 && brief.length >= 17 ? matches / brief.length : 0;
}

export function collaborationFollowUp(o: Observations): VivaRecord {
  const question = o.ghostRequested
    ? 'How did you decide which wording to write yourself and how to describe the assistant’s contribution?'
    : o.studentMessages.some((text) => /\b(source|evidence|denominator|caus|observational)\w*/i.test(text))
      ? 'Choose one conclusion in your brief. Which source supports it, and what can that source not establish?'
      : 'Describe one assistant suggestion you kept, changed or left out. What was your reason?';
  return { kind: 'generic', claimId: null, question };
}

export function scoreCollaboration(s: Scenario, o: Observations): Result {
  // Retain the separate task-completion checks, without interpreting the planted claims.
  const result = scoreSession(s, { ...o, draftShown: false, p2Shown: false, p2Accepted: false });
  const messages = o.studentMessages;
  const answered = o.conversation ? answeredMessages(o.conversation) : o.assistantReplies.length ? messages : [];
  const interacted = o.conversation ? o.conversation.some((m) => m.role === 'assistant' && !m.scripted && !m.failed) : o.assistantReplies.length > 0;
  const requestedPlanning = answered.some(asksForDirection);
  const requestedBasis = answered.some(asksForBasis);
  const explanations = [...messages, ...(o.viva?.answer ? [o.viva.answer] : [])];
  const explainedChoice = explanations.some(reasonedChoice);
  const { limited: limitedConclusion, strong: strongCausalClaim } = causalWording(o.brief);
  const requestedReview = answered.some(asksForReview);
  const wordingOverlap = distinctiveOverlap(s, o);
  const mismatchedDisclosure = interacted && o.declared === 'MINE' && wordingOverlap >= s.thresholds.OVERLAP_AI;
  const checks: CollaborationCheck[] = [];
  const add = (id: string, title: string, status: CollaborationCheck['status'], evidence: string, criterion: string, next: string) => {
    checks.push({ id, title, status, evidence, criterion, next });
  };
  add('direction', 'Directing the assistant', interacted && requestedPlanning ? 'supported' : 'insufficient',
    interacted && requestedPlanning ? 'You requested an explanation, comparison, plan or feedback during the conversation.' : 'No planning or explanation request with an assistant reply was recognised.',
    'Records the kind of help requested. Prompt length and message count earn no credit.',
    'Ask for the help you need at that point, such as comparing interpretations or reviewing your plan.');
  add('basis', 'Tracing the evidence', interacted && requestedBasis && result.quality.sourced && result.quality.validPoints >= 2 ? 'supported' : 'insufficient',
    requestedBasis ? 'You asked about the basis of a claim. The submitted brief is also checked separately for named sources.' : 'No targeted request about a claim’s source, calculation or causal basis was recognised.',
    'Requires a targeted evidence request and at least two recognised, attributed data points in the final brief. This records observable actions, not proof that verification was completed.',
    'Ask where an important conclusion comes from and explain how the source supports it in your own brief.');
  add('selection', 'Explaining your choices', interacted && explainedChoice ? 'supported' : 'insufficient',
    explainedChoice ? 'You explicitly described a choice to keep, change or leave out material and gave a reason in the conversation or follow-up.' : 'No explicit choice with a reason was recognised. Silent omissions and edits do not establish why you made them.',
    'Looks for a stated decision and reason in one message or follow-up answer. It does not infer understanding from editing alone.',
    'Explain one suggestion you kept or changed and why it suits the evidence and task.');
  add('uncertainty', 'Calibrating conclusions', strongCausalClaim ? 'practise' : interacted && limitedConclusion ? 'supported' : 'insufficient',
    strongCausalClaim ? 'The final brief contains a strong causal expression without a recognised qualification in that sentence.' : limitedConclusion ? 'The final brief explicitly limits a causal conclusion or identifies the observational design.' : 'No explicit discussion of the evidence’s limits was recognised.',
    'Checks the final wording against the observational nature of this source pack. It does not establish how the student arrived at that wording.',
    'Distinguish a difference between groups from evidence that AI caused it.');
  add('ownership', 'Describing the AI contribution', mismatchedDisclosure ? 'practise' : 'insufficient',
    mismatchedDisclosure ? 'You declared the wording mostly yours, while substantial distinctive phrasing first appeared in assistant replies. This needs explanation, not an automatic authorship verdict.' : interacted ? 'Your authorship declaration was recorded. Wording similarity alone cannot establish who made the decisions or understood the work.' : 'There was no assistant reply to compare with the submitted wording.',
    'A strong overlap in distinctive AI phrasing alongside a mostly-mine declaration prompts reflection. Source wording and wording previously supplied by the student are excluded. Honest disclosure, copying and understanding are not treated as interchangeable.',
    'Describe which parts AI helped with and which decisions and wording you took responsibility for.');
  add('review', 'Following through on review', o.reviewFollowedThrough && result.quality.met ? 'supported' : 'insufficient',
    requestedReview ? 'You requested a review. A completed review also needs an explicit decision and a brief meeting the separate task checks.' : 'No request to review the brief against sources or task requirements was recognised.',
    'A review request alone earns no positive judgement. The rule requires an assistant reply after the review request, a subsequent reasoned choice, and passing task checks. It cannot prove the feedback caused the final edits.',
    'Review against the requirements, then explain what you changed or chose to keep.');
  // Anchor: when the pre-written summary was shown, its statements are judged by rule. Reported separately from the observations above.
  // It uses the per-statement debrief answers, confidence, questions put to the assistant, and the brief itself.
  const anchor = o.draftShown ? scoreSession(s, { ...o, p2Shown: false, p2Accepted: false }) : null;
  return {
    ...result, collaboration: checks, suggestions: [], own: { checks: [], viva: null },
    claims: anchor?.claims ?? [], discern: anchor?.discern ?? result.discern, decide: anchor?.decide ?? result.decide,
    headline: anchor?.headline ?? result.headline, incidents: anchor ? anchor.incidents.filter((i) => i === 'E1') : [],
  };
}
