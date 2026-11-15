export type Mode = 'judge' | 'full';
export type Dimension = 'Effective' | 'Critical' | 'Independent' | 'Responsible';
export type Score = 0 | 1 | 2;

export interface Claim {
  id: string;
  title: string;
  text: string;
  is_flawed: boolean;
  flaw_type: string | null;
  error_markers: string[];
  fixed_markers?: string[];
  keep_markers: string[];
  negation_ok?: boolean;
  section: string;
  ask_markers: string[];
  reask_text: string;
  reveal_text: string;
  advice: string;
  judge_path: boolean;
  needs_review: boolean;
}

export interface NodeDef {
  id: string;
  dimension: Dimension;
  title: string;
  reveal_text: string;
  advice: string;
  judge_path: boolean;
  needs_review: boolean;
}

export interface Scenario {
  meta: { needs_review: boolean; notice: string };
  time_limit_s: Record<Mode, number>;
  task: { title: string; prompt: string; requirements: string[] };
  pack: { id: string; title: string; body: string }[];
  names: string[];
  view_markers: string[];
  source_markers: string[];
  draft_intro: string;
  draft_outro: string;
  claims: Claim[];
  teammate: { from: string; text: string; target_claim: string; delay_s: number };
  nodes: NodeDef[];
}

/** Everything the scorer needs, derived from the session and its event log. Times are seconds since work started. */
export interface Observations {
  mode: Mode;
  firstInstruction: string;
  brief: string;
  /** First time each pack section was opened after the assistant's draft appeared. */
  openedAfterDraft: Record<string, number>;
  /** Sections opened after the teammate message appeared. */
  openedAfterTeammate: string[];
  teammateAt?: number;
  /** Claim ids the student asked the assistant about. */
  queried: string[];
  exposedClaimIds: string[];
  revisions: string[];
  studentMessages: Msg[];
  assistantReplies: string[];
  commentsOpened: boolean;
  namesSentToAI: string[];
  ghostwriteRequested: boolean;
  overtime: boolean;
  quoteInstruction: boolean;
}

export interface NodeResult {
  id: string;
  dimension: Dimension;
  title: string;
  score: Score | null;
  criterion?: string;
  statement?: string;
  evidence: string;
  reveal: string;
  advice: string;
  flawed?: boolean;
  trustedError?: boolean;
}

export interface ScoreTotal {
  earned: number;
  possible: number;
  percentage: number | null;
}

export interface Result {
  nodes: NodeResult[];
  suggestions: string[];
}

export type SessionState = 'consent' | 'intro' | 'work' | 'debrief' | 'reveal';

export interface Msg {
  role: 'user' | 'assistant' | 'teammate';
  text: string;
  ts: number;
  claims?: { id: string; text: string }[];
}

export interface SessionData {
  messages: Msg[];
  turns: number;
  draftShownAt?: number;
  controlledClaimId?: string;
  teammateAt?: number;
  firstInstruction?: string;
  namesSent: string[];
  ghostwrite: boolean;
  queried: string[];
  opens: { section: string; ts: number }[];
  brief?: string;
  submittedAt?: number;
  result?: Result;
}

export interface Session {
  id: string;
  mode: Mode;
  store: boolean;
  state: SessionState;
  createdAt: number;
  startedAt: number | null;
  data: SessionData;
}
