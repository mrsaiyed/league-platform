// The live game's storage (step 2.29) on plain objects, for core's tests of the
// tracker's commands. The same command runs against the real database in
// packages/database (stores/tracker-commands.test.ts and the two-league harness). The
// database's own rules for events (each command id and seq once per game, seq with no
// gaps) are stood in for by the checks made here.
//
// `lockingTracker` runs transactions over one shared state with a real lock per game,
// to show batches for different games never wait for each other (T-112): PGlite has
// one connection and runs transactions one after another, so it cannot show that.
import type { JobQueue, TransactionRunner } from '../../command/index.ts';
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import { gamesTxOf, leagueId, type MemoryGames } from './memory-games.test-helper.ts';
import {
  initialScoring,
  sessionsOf,
  testClock,
  type MemoryScoring,
} from './memory-scoring.test-helper.ts';
import type { GamePlayer, LiveGameLine, LiveGamesStore, NewGameEvent, TrackerTx } from './ports.ts';

export type MemoryTracker = MemoryScoring & {
  states: { gameId: string; seq: number; state: unknown }[];
  events: NewGameEvent[];
  liveLines: LiveGameLine[];
  players: GamePlayer[];
};

const initialTracker = (state: Partial<MemoryTracker>): MemoryTracker => ({
  ...initialScoring({}),
  states: [],
  events: [],
  liveLines: [],
  players: [],
  ...state,
});

/** The game's teams, read as the database's players query reads them. */
const teamsOf = (s: MemoryGames, gameId: string) => {
  const game = s.games.find((g) => g.id === gameId);
  return game === undefined ? [] : [game.homeTeamId, game.awayTeamId];
};

/** The live game over one state; `lock` is the stand-in's, or none. */
export function liveGamesOf(
  s: MemoryTracker,
  lock: (gameId: string) => Promise<void> = async () => {},
): LiveGamesStore {
  return {
    lock: async (gameId) => {
      if (!s.games.some((g) => g.id === gameId)) return false;
      await lock(gameId);
      return true;
    },
    findState: async (gameId) => {
      const found = s.states.find((x) => x.gameId === gameId);
      return found === undefined
        ? undefined
        : { seq: found.seq, state: structuredClone(found.state) };
    },
    takenCommands: async (gameId, commandIds) =>
      s.events
        .filter((e) => e.gameId === gameId && commandIds.includes(e.commandId))
        .map((e) => e.commandId),
    addEvents: async (events) => {
      for (const event of events) {
        const own = s.events.filter((e) => e.gameId === event.gameId);
        if (own.some((e) => e.commandId === event.commandId)) {
          throw new Error('game_events_command_once');
        }
        if (event.seq !== own.length + 1) throw new Error('game_events_in_order');
        s.events.push(structuredClone(event));
      }
    },
    saveState: async (gameId, seq, state) => {
      s.states = [
        ...s.states.filter((x) => x.gameId !== gameId),
        { gameId, seq, state: structuredClone(state) },
      ];
    },
    players: async (gameId) => {
      const teams = teamsOf(s, gameId);
      return s.players.filter((p) => teams.includes(p.teamId));
    },
    saveLines: async (gameId, lines, removed) => {
      const replaced = new Set([...removed, ...lines.map((l) => l.personId)]);
      s.liveLines = [
        ...s.liveLines.filter((l) => !(l.gameId === gameId && replaced.has(l.personId))),
        ...structuredClone(lines),
      ];
    },
  };
}

const trackerTxOf = (
  s: MemoryTracker,
  jobs: JobQueue,
  clock: ReturnType<typeof testClock>,
  lock?: (gameId: string) => Promise<void>,
): TrackerTx => ({
  ...gamesTxOf(s, jobs),
  clock,
  scoringSessions: sessionsOf(s),
  liveGames: liveGamesOf(s, lock),
});

/** Each transaction works on a copy, kept only if it returns (nothing kept on a refusal). */
export function memoryTracker(state: Partial<MemoryTracker> = {}) {
  const db = memoryDatabase<MemoryTracker>(initialTracker(state));
  const clock = testClock();
  const transaction = memoryTransaction(db, (s, jobs) => trackerTxOf(s, jobs, clock));
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, clock };
}

/**
 * Transactions over one shared state, each holding the lock of the game it locked
 * until it ends, as PostgreSQL holds a row lock to commit. `held` counts the locks
 * held now and `mostHeld` the most ever held at once. `onLocked` runs once a
 * transaction holds its game, before it reads anything. Nothing is rolled back: use
 * it only for batches that are taken.
 */
export function lockingTracker(
  state: Partial<MemoryTracker>,
  onLocked: (gameId: string) => Promise<void>,
) {
  const db = memoryDatabase<MemoryTracker>(initialTracker(state));
  const clock = testClock();
  const queues = new Map<string, Promise<void>>();
  const counts = { held: 0, mostHeld: 0 };
  const jobs: JobQueue = { enqueue: async (job) => void db.jobs.push(job) };
  const transaction: TransactionRunner<TrackerTx> = async (context, work) => {
    db.opened.push(context);
    const releases: (() => void)[] = [];
    const lock = async (gameId: string) => {
      const before = queues.get(gameId) ?? Promise.resolve();
      let release = () => {};
      const mine = new Promise<void>((resolve) => (release = resolve));
      queues.set(
        gameId,
        before.then(() => mine),
      );
      await before;
      counts.held += 1;
      counts.mostHeld = Math.max(counts.mostHeld, counts.held);
      releases.push(() => {
        counts.held -= 1;
        release();
      });
      await onLocked(gameId);
    };
    try {
      return await work(trackerTxOf(db.state, jobs, clock, lock));
    } finally {
      for (const release of releases) release();
    }
  };
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, clock, counts };
}
