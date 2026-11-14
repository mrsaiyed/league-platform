// The scoring sessions (T-116) on plain objects, with a clock the test moves by hand,
// for core's command tests. The same commands run against the real database in
// packages/database (stores/scoring-sessions-commands.test.ts and the two-league
// harness). PGlite has one connection and runs transactions one after another, so
// two requests truly overlapping are tried here instead (racingScoring).
import type { JobQueue, TransactionRunner } from '../../command/index.ts';
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import { emptyGames, gamesTxOf, leagueId, type MemoryGames } from './memory-games.test-helper.ts';
import type { ScoringSession, ScoringSessionsStore, ScoringTx } from './ports.ts';

export type MemoryScoring = MemoryGames & {
  sessions: ScoringSession[];
  /** How many sessions were ever started: each new one gets the next id. */
  started: number;
};

/** The moment the tests begin: 6 December 2026, 18:00 UTC. */
export const startOfTest = Date.UTC(2026, 11, 6, 18, 0, 0);

export const sessionUuid = (n: number) =>
  `01900000-0000-7000-8000-0000005e${String(n).padStart(4, '0')}`;

export type MemoryScoringOptions = {
  /** Runs just before a session is started: another request getting there first. */
  readonly beforeStart?: (state: MemoryScoring) => void;
  /** Runs just before a session is ended: another request ending it first. */
  readonly beforeEnd?: (state: MemoryScoring) => void;
};

function testClock() {
  const clock = {
    at: startOfTest,
    now: () => clock.at,
    /** Moves the clock on by this many seconds. */
    advance: (seconds: number) => void (clock.at += seconds * 1000),
  };
  return clock;
}

const initial = (state: Partial<MemoryScoring>): MemoryScoring => ({
  ...emptyGames(),
  sessions: [],
  started: 0,
  ...state,
});

/**
 * The sessions over one state. Each call checks and writes without waiting in
 * between, as the database's one-session-per-game rule does in a single statement.
 */
function sessionsOf(s: MemoryScoring, options: MemoryScoringOptions = {}): ScoringSessionsStore {
  return {
    findForGame: async (gameId) => s.sessions.find((x) => x.gameId === gameId),
    start: async (session) => {
      options.beforeStart?.(s);
      if (s.sessions.some((x) => x.gameId === session.gameId)) return undefined;
      s.started += 1;
      const started = { ...session, id: sessionUuid(s.started) };
      s.sessions.push(started);
      return started;
    },
    extend: async (gameId, sessionId, heldUntil) => {
      const at = s.sessions.findIndex((x) => x.gameId === gameId && x.id === sessionId);
      const found = s.sessions[at];
      if (found === undefined) return false;
      s.sessions[at] = { ...found, heldUntil };
      return true;
    },
    end: async (gameId, sessionId, lapsedBy) => {
      options.beforeEnd?.(s);
      const found = s.sessions.find((x) => x.gameId === gameId && x.id === sessionId);
      if (found === undefined) return false;
      if (lapsedBy !== undefined && found.heldUntil > lapsedBy) return false;
      s.sessions = s.sessions.filter((x) => x !== found);
      return true;
    },
  };
}

export function memoryScoring(
  state: Partial<MemoryScoring> = {},
  options: MemoryScoringOptions = {},
) {
  const db = memoryDatabase<MemoryScoring>(initial(state));
  const clock = testClock();
  const transaction = memoryTransaction(
    db,
    (s, jobs): ScoringTx => ({
      ...gamesTxOf(s, jobs),
      clock,
      scoringSessions: sessionsOf(s, options),
    }),
  );
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, clock };
}

/** Resolves for everyone once `count` callers have arrived. */
function barrier(count: number): () => Promise<void> {
  let arrived = 0;
  let release = () => {};
  const all = new Promise<void>((resolve) => (release = resolve));
  return async () => {
    arrived += 1;
    if (arrived >= count) release();
    await all;
  };
}

/**
 * `racers` requests overlapping for real: every transaction works on the one shared
 * state, and each waits after its first read of the game's session until all of them
 * have read it. So all of them see the same session (or none) and then all try to
 * write, as two devices opening at the same instant would on PostgreSQL at read
 * committed. Nothing is rolled back: use it only for commands that succeed.
 */
export function racingScoring(racers: number, state: Partial<MemoryScoring> = {}) {
  const db = memoryDatabase<MemoryScoring>(initial(state));
  const clock = testClock();
  const arrive = barrier(racers);
  const jobs: JobQueue = { enqueue: async (job) => void db.jobs.push(job) };
  const transaction: TransactionRunner<ScoringTx> = async (context, work) => {
    db.opened.push(context);
    const sessions = sessionsOf(db.state);
    let waited = false;
    return work({
      ...gamesTxOf(db.state, jobs),
      clock,
      scoringSessions: {
        ...sessions,
        findForGame: async (gameId) => {
          const found = await sessions.findForGame(gameId);
          if (!waited) {
            waited = true;
            await arrive();
          }
          return found;
        },
      },
    });
  };
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, clock };
}
