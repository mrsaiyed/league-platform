// The scoring sessions (T-116) on plain objects, with a clock the test moves by hand,
// for core's command tests. The same commands run against the real database in
// packages/database (stores/scoring-sessions-commands.test.ts and the two-league
// harness), where two devices really do race.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import { emptyGames, gamesTxOf, leagueId, type MemoryGames } from './memory-games.test-helper.ts';
import type { ScoringSession, ScoringTx } from './ports.ts';

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
};

export function memoryScoring(
  state: Partial<MemoryScoring> = {},
  options: MemoryScoringOptions = {},
) {
  const db = memoryDatabase<MemoryScoring>({ ...emptyGames(), sessions: [], started: 0, ...state });
  const clock = {
    at: startOfTest,
    now: () => clock.at,
    /** Moves the clock on by this many seconds. */
    advance: (seconds: number) => void (clock.at += seconds * 1000),
  };
  const transaction = memoryTransaction(
    db,
    (s, jobs): ScoringTx => ({
      ...gamesTxOf(s, jobs),
      clock,
      scoringSessions: {
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
          const found = s.sessions.find((x) => x.gameId === gameId && x.id === sessionId);
          if (found === undefined) return false;
          if (lapsedBy !== undefined && found.heldUntil > lapsedBy) return false;
          s.sessions = s.sessions.filter((x) => x !== found);
          return true;
        },
      },
    }),
  );
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, clock };
}
