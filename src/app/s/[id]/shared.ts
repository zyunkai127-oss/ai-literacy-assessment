// Client-side helpers and view types. Nothing here may import scoring.ts or scenario.ts: those hold the answer key and stay on the server.
import type { AdaptiveFlow, Mode, Msg, Result, SessionState, SupportLevel } from '@/lib/types';

export type PackItem = { id: string; title: string; body?: string; locked: boolean };
export type PublicMsg = Pick<Msg, 'role' | 'text' | 'ts' | 'claims'>;
export type View = {
  id: string; state: SessionState; mode: Mode; store: boolean;
  scenario: {
    notice: string; timeLimit: number;
    task: { title: string; prompt: string; requirements: string[] };
    pack: PackItem[]; budget: number; budgetNote: string; offerDelay: number;
  };
  startedAt: number | null; serverNow: number;
  messages: PublicMsg[]; brief: string;
  claims: { id: string; text: string }[];
  draftShownAt: number | null; offerShown: boolean;
  opened: Record<string, string>; remaining: number;
  adaptive: { status: AdaptiveFlow['status']; round: number; turnId: number | null; support: SupportLevel | null; question: string | null; sources: { title: string; body: string }[] } | null;
  guideOnly: boolean; viva: { question: string } | null; liveModel: boolean;
};
export type Reveal = Omit<Result, 'discern' | 'decide'> & {
  discern: Omit<Result['discern'], 'H' | 'F'>;
  decide: Omit<Result['decide'], 'mean' | 'ci'>;
  cohort: { claimId: string; shipped: number; n: number }[];
  statements: { id: string; text: string; wrong: boolean }[];
  notice: string;
};

export const post = (url: string, body: unknown = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export async function errorOf(res: Response, fallback: string) {
  try { return ((await res.json()) as { error?: string }).error ?? fallback; } catch { return fallback; }
}
