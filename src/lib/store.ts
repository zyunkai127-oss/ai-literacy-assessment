// SQLite persistence: sessions and an append-only event log. Uses Node's built-in sqlite (Node 22.13+).
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Mode, Observations, Result, Session, SessionData, SessionState } from './types';

const g = globalThis as unknown as { __alcDb?: DatabaseSync };

function db(): DatabaseSync {
  if (g.__alcDb) return g.__alcDb;
  const path = process.env.DB_PATH ?? './data/app.db';
  mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync: Db } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  const d = new Db(path);
  d.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, store INTEGER NOT NULL, state TEXT NOT NULL,
      created_at INTEGER NOT NULL, started_at INTEGER, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, ts INTEGER NOT NULL,
      type TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_session ON events(session_id);
  `);
  return (g.__alcDb = d);
}

type Row = { id: string; mode: string; store: number; state: string; created_at: number; started_at: number | null; data: string };
const toSession = (r: Row): Session => ({
  id: r.id, mode: r.mode as Mode, store: !!r.store, state: r.state as SessionState,
  createdAt: r.created_at, startedAt: r.started_at, data: JSON.parse(r.data) as SessionData,
});

export function createSession(mode: Mode, store: boolean): Session {
  const s: Session = {
    id: randomUUID(), mode, store, state: 'intro', createdAt: Date.now(), startedAt: null,
    data: { messages: [], turns: 0, namesSent: [], ghostwrite: false, queried: [], opens: [] },
  };
  db().prepare('INSERT INTO sessions (id, mode, store, state, created_at, started_at, data) VALUES (?,?,?,?,?,?,?)')
    .run(s.id, s.mode, s.store ? 1 : 0, s.state, s.createdAt, null, JSON.stringify(s.data));
  logEvent(s.id, 'consent', { mode, store });
  return s;
}

export function getSession(id: string): Session | null {
  const r = db().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined;
  return r ? toSession(r) : null;
}

export function saveSession(s: Session) {
  db().prepare('UPDATE sessions SET state = ?, started_at = ?, data = ? WHERE id = ?').run(s.state, s.startedAt, JSON.stringify(s.data), s.id);
}

export function logEvent(sessionId: string, type: string, payload: unknown = {}) {
  db().prepare('INSERT INTO events (session_id, ts, type, payload) VALUES (?,?,?,?)').run(sessionId, Date.now(), type, JSON.stringify(payload));
}

export function allEvents(sinceMs = 0) {
  return (db().prepare('SELECT session_id, ts, type, payload FROM events WHERE ts >= ? ORDER BY id').all(sinceMs) as { session_id: string; ts: number; type: string; payload: string }[])
    .map((e) => ({ ...e, payload: JSON.parse(e.payload) }));
}

/** Finished sessions whose owners agreed to anonymous storage, from the last 24 hours. */
export function cohortSessions(): Session[] {
  const since = Date.now() - 24 * 3600 * 1000;
  return (db().prepare("SELECT * FROM sessions WHERE store = 1 AND state = 'reveal' AND created_at >= ?").all(since) as Row[]).map(toSession);
}

export function sessionCounts() {
  return db().prepare('SELECT state, COUNT(*) AS n FROM sessions GROUP BY state').all() as { state: string; n: number }[];
}

/** Persist the result and clear non-consenting participants' own words in the same transaction. */
export function finishSession(s: Session, result: Result) {
  const database = db();
  database.exec('BEGIN');
  try {
    if (!s.store) {
      database.prepare("DELETE FROM events WHERE session_id = ? AND type IN ('chat_user','chat_assistant','draft_snapshot','submit','debrief','viva')").run(s.id);
      s.data = { messages: [], turns: 0, namesSent: [], ghostwrite: false, queried: [], opens: [] };
    }
    s.data.result = result;
    saveSession(s);
    logEvent(s.id, 'scored', { incidents: result.incidents, discern: result.discern.type ?? result.discern.status, decide: result.decide.band ?? result.decide.status });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

/** Builds the scorer's input from server-side session state. */
export function observe(s: Session, timeLimit: number): Observations {
  const start = s.startedAt ?? s.createdAt;
  const sec = (ts: number) => Math.max(0, (ts - start) / 1000);
  const d = s.data;
  const openedAt: Record<string, number> = {};
  for (const o of d.opens) if (openedAt[o.section] === undefined) openedAt[o.section] = sec(o.ts);
  const queriedAt: Record<string, number> = {};
  for (const [id, ts] of Object.entries(d.queriedAt ?? {})) queriedAt[id] = sec(ts);
  return {
    mode: s.mode,
    brief: d.brief ?? '',
    firstInstruction: d.firstInstruction ?? '',
    assistantReplies: d.messages.filter((m) => m.role === 'assistant' && m.scripted !== 'refusal').map((m) => m.text),
    studentMessages: d.messages.filter((m) => m.role === 'user' && !!d.draftShownAt && m.ts >= d.draftShownAt).map((m) => m.text),
    draftShown: !!d.draftShownAt,
    flagged: d.debrief?.flagged ?? [],
    leastSure: d.debrief?.leastSure ?? [],
    queried: d.queried,
    queriedAt,
    openedAt,
    confidence: d.debrief?.confidence ?? 0.5,
    declared: d.debrief?.declared ?? 'MINE',
    namesToAI: d.namesSent,
    ghostRequested: !!d.ghostRequested,
    p2Shown: !!d.p2ShownAt,
    p2Accepted: !!d.p2Accepted,
    onTime: !d.submittedAt || sec(d.submittedAt) <= timeLimit + 5,
    quoteText: s.store,
    ...(d.viva?.answer !== undefined ? { viva: { kind: d.viva.kind, claimId: d.viva.claimId, question: d.viva.question, answer: d.viva.answer } } : {}),
  };
}
