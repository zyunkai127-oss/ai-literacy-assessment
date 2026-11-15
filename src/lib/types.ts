export type Mode = 'judge' | 'full';
export type Role = 'signal' | 'decoy';
export type Path = 'verify' | 'reason' | 'either';
export type Sdt = 'HIT' | 'MISS' | 'FA' | 'CR';
export type DiscernType = 'CALIBRATED' | 'SCEPTICAL' | 'CREDULOUS' | 'MISPLACED';
export type Band = 'Emerging' | 'Developing' | 'Proficient';
export type Declared = 'MINE' | 'MIXED' | 'AI';
export type Decision = 'relied' | 'unsure' | 'not';
export type VivaKind = 'confident_wrong' | 'false_alarm' | 'hit' | 'generic';
export type Incident = 'E1' | 'E2' | 'E3';
export type SessionState = 'consent' | 'intro' | 'work' | 'debrief' | 'viva' | 'reveal';

export interface Claim {
  id: string; title: string; text: string;
  role: Role; path: Path | null; section: string;
  is_flawed: boolean; flaw_type: string | null;
  error_markers: string[]; fixed_markers?: string[]; keep_markers: string[]; negation_ok?: boolean;
  ask_markers: string[]; reask_text: string;
  basis_markers: string[]; lure?: boolean;
  reveal_text: string; advice: string;
  judge_path: boolean; needs_review: boolean;
}

export interface Thresholds {
  H_HIGH: number; F_HIGH: number; DECIDE_MIN_ITEMS: number;
  BAND_PROFICIENT: number; BAND_DEVELOPING: number; WIDE_CI: number;
  OVERCONF: number; CONFIDENT: number; OVERLAP_MIXED: number; OVERLAP_AI: number;
  WORDS_MIN: number; WORDS_MAX: number;
}

export interface Scenario {
  meta: { needs_review: boolean; notice: string };
  time_limit_s: Record<Mode, number>;
  task: { title: string; prompt: string; requirements: string[] };
  pack: { id: string; title: string; body: string }[];
  evidence_sections: string[];
  budget: Record<Mode, number>;
  budget_note: string;
  names: string[]; view_markers: string[]; source_markers: string[];
  draft_intro: string; draft_outro: string;
  claims: Claim[];
  ghostwrite_offer: { text: string; paragraph: string; delay_s: Record<Mode, number> };
  accept_markers: string[];
  thresholds: Thresholds;
  advice: Record<string, string>;
  reveal: Record<string, string>;
}

export interface Msg {
  failed?: boolean;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  claims?: { id: string; text: string }[];
  scripted?: 'draft' | 'reask' | 'offer' | 'refusal' | 'greeting' | 'guide' | 'ghost';
  /** Blocked by the injection guardrail: stored for the record, never sent to the model. */
  blocked?: boolean;
}

export interface VivaRecord { kind: VivaKind; claimId: string | null; question: string; answer?: string }

export interface SessionData {
  adaptive?: AdaptiveFlow;
  messages: Msg[];
  turns: number;
  draftShownAt?: number;
  firstInstruction?: string;
  namesSent: string[];
  /** Guide-only mode: set by a request for finished work or by accepting the offer. Stays on for the session. */
  ghostwrite: boolean;
  /** The student asked for finished work unprompted (not as a reply to the offer). */
  ghostRequested?: boolean;
  queried: string[];
  queriedAt?: Record<string, number>;
  opens: { section: string; ts: number }[];
  brief?: string;
  submittedAt?: number;
  p2ShownAt?: number;
  p2Responded?: boolean;
  p2Accepted?: boolean;
  debrief?: { flagged: string[]; leastSure: string[]; confidence: number; declared: Declared };
  viva?: VivaRecord;
  result?: Result;
}

export interface Session {
  id: string; mode: Mode; store: boolean; state: SessionState;
  createdAt: number; startedAt: number | null; data: SessionData;
}

/** The scorer's only input. Times are seconds since the clock started. */
export interface Observations {
  conversation?: Msg[];
  reviewFollowedThrough?: boolean;
  mode: Mode;
  brief: string;
  firstInstruction: string;
  /** Every assistant reply, scripted or live, for the wording-overlap check. */
  assistantReplies: string[];
  /** Student messages sent after the summary appeared, for explicit rejections in chat. */
  studentMessages: string[];
  draftShown: boolean;
  flagged: string[];
  leastSure: string[];
  queried: string[];
  queriedAt: Record<string, number>;
  openedAt: Record<string, number>;
  confidence: number;
  declared: Declared;
  namesToAI: string[];
  ghostRequested: boolean;
  p2Shown: boolean;
  p2Accepted: boolean;
  /** The paragraph the assistant wrote after its offer was accepted, if it did. */
  offerParagraph?: string;
  onTime: boolean;
  /** Quote the student's own words in feedback only when they agreed to storage. */
  quoteText: boolean;
  viva?: { kind: VivaKind; claimId: string | null; question: string; answer: string };
}

export interface ClaimCode {
  id: string; role: Role;
  used: string | null; fixed: string | null;
  flagged: boolean; chatRejected: boolean; queried: boolean; leastSure: boolean;
  checkedAt: number | null;
  ladder: 0 | 1 | 2 | null; sdt: Sdt | null; d1: 'success' | 'fail' | null;
}

export interface DecideItem { id: 'D1' | 'D3' | 'D4'; claimId?: string; outcome: 'success' | 'fail'; evidence: string }
export interface OwnCheck { id: 'O1' | 'O2' | 'O3' | 'O4'; title: string; ok: boolean | null; evidence: string; reveal: string; advice: string }

export interface ClaimReview extends ClaimCode {
  title: string; text: string; flawed: boolean; criterion: string; evidence: string; reveal: string; advice: string;
}

export interface CollaborationCheck {
  id: string;
  title: string;
  status: 'supported' | 'practise' | 'insufficient';
  evidence: string;
  criterion: string;
  next: string;
}

export interface Result {
  followUp?: FollowUpSummary;
  assessment?: { status: 'complete' | 'unavailable' };
  collaboration?: CollaborationCheck[];
  headline: { kind: Incident | 'best_call' | 'none'; claimId: string | null; happened: string; means: string; next: string };
  discern: { status: 'ok' | 'insufficient'; type?: DiscernType; label?: string; meaning?: string; H?: number; F?: number; hits: number; misses: number; fas: number; crs: number };
  decide: { status: 'ok' | 'insufficient'; band?: Band; mean?: number; ci?: [number, number]; wide?: boolean; capped?: boolean; items: DecideItem[] };
  own: { checks: OwnCheck[]; viva: { kind: VivaKind; claimId: string | null; question: string; answer: string; rating: 0 | 1 | 2 } | null };
  direct: { features: { topic: boolean; length: boolean; sources: boolean; audience: boolean }; instruction: string | null };
  quality: { words: number; validPoints: number; attributed: number; hasView: boolean; sourced: boolean; wordsOK: boolean; onTime: boolean; met: boolean };
  incidents: Incident[];
  claims: ClaimReview[];
  suggestions: string[];
}

export type AdaptiveTarget = 'basis' | 'uncertainty' | 'selection';
export type SupportLevel = 'none' | 'general' | 'specific';
export type FollowUpOutcome = 'met' | 'not_met' | 'unclear';
export interface FollowUpObservation {
  outcome: FollowUpOutcome;
  signal: 'accurate' | 'partial' | 'misconception' | 'ambiguous';
  evidence: string;
}
export interface AdaptiveAction {
  action: 'ask' | 'finish' | 'escalate';
  questionId: string;
  reason: 'probe' | 'deepen' | 'scaffold' | 'sufficient' | 'ambiguous';
}
export interface AdaptiveTurn {
  id: number; questionId: string; target: AdaptiveTarget; support: SupportLevel;
  answer?: string; observation?: FollowUpObservation; verified?: boolean; human?: boolean;
}
export interface AgentTrace {
  role: 'observer' | 'planner' | 'verifier' | 'human';
  event: string; round: number; ms: number; inputTokens: number; outputTokens: number; ts: number;
}
export interface AdaptiveFlow {
  status: 'preparing' | 'asking' | 'review' | 'complete' | 'unavailable';
  core: Result;
  turns: AdaptiveTurn[];
  trace: AgentTrace[];
  candidate?: AdaptiveAction;
  reviewReason?: string;
}
export interface FollowUpSummary {
  status: 'complete' | 'unavailable';
  turns: { id: number; target: AdaptiveTarget; support: SupportLevel; outcome: FollowUpOutcome; reviewed: 'automatic' | 'human' | 'unresolved' }[];
  calls: number; latencyMs: number; inputTokens: number; outputTokens: number; humanReviewed: boolean;
}
