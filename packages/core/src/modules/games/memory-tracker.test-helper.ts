// The live game's storage (step 2.29) on plain objects, for core's tests of the
// tracker's commands. The same command runs against the real database in
// packages/database (stores/tracker-commands.test.ts and the two-league harness). The
// database's own rules for events (each command id and seq once per game, seq with no
// gaps) are stood in for by the checks made here.
//
// `lockingTracker` runs transactions over one shared state with a real lock per game,
// to show batches for different games never wait for each other (T-112): PGlite has
// one connection and runs transactions one after another, so it cannot show that.
import type {
  DomainEvent,
  EventHandler,
  JobQueue,
  TransactionRunner,
} from '../../command/index.ts';
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
  /** Where each player added at a scorer's table was added, and whether they wait for review (0010). */
  tableMarks: { teamId: string; personId: string; addedAtGameId: string; needsReview: boolean }[];
  /** The season wants unique numbers on a team (0008). */
  uniqueJerseys: boolean;
};

const initialTracker = (state: Partial<MemoryTracker>): MemoryTracker => ({
  ...initialScoring({}),
  states: [],
  events: [],
  liveLines: [],
  players: [],
  tableMarks: [],
  uniqueJerseys: false,
  ...state,
});

/**
 * The scorer's table's changes (record 058) over the game's two lists: `players` (the
 * tracker's) and `roster` (with names), kept in step. A roster entry's id here is
 * "team|person". The database's rules (unique numbers where the season wants them, an
 * id once, nothing removed that has lines) are stood in for by the checks made here.
 */
function tablePlayersOf(
  s: MemoryTracker,
): Pick<
  LiveGamesStore,
  | 'findTablePlayer'
  | 'addTablePlayer'
  | 'setTablePlayerNumber'
  | 'renameTablePlayer'
  | 'removeTablePlayer'
> {
  const split = (entryId: string) => {
    const [teamId = '', personId = ''] = entryId.split('|');
    return { teamId, personId };
  };
  const worn = (teamId: string, personId: string, jersey: string | null) =>
    s.uniqueJerseys &&
    jersey !== null &&
    s.roster.some(
      (r) => r.teamId === teamId && !r.left && r.jerseyNumber === jersey && r.personId !== personId,
    );
  return {
    findTablePlayer: async (teamId, personId) => {
      const entry = s.roster.find(
        (r) => r.teamId === teamId && r.personId.toLowerCase() === personId && !r.left,
      );
      if (entry === undefined) return undefined;
      const mark = s.tableMarks.find((m) => m.teamId === teamId && m.personId === personId);
      return {
        entryId: `${teamId}|${personId}`,
        teamId,
        personId,
        jerseyNumber: entry.jerseyNumber,
        firstName: entry.firstName,
        lastName: entry.lastName,
        addedAtGameId: mark?.addedAtGameId ?? null,
      };
    },
    addTablePlayer: async (player) => {
      const ids = [...s.players, ...s.roster].map((p) => p.personId.toLowerCase());
      if (ids.includes(player.personId)) return 'id-taken';
      if (worn(player.teamId, player.personId, player.jerseyNumber)) return 'jersey-taken';
      const { teamId, personId, jerseyNumber, firstName, lastName } = player;
      s.players.push({ personId, teamId, jerseyNumber, onGameDay: true });
      s.roster.push({ teamId, personId, firstName, lastName, jerseyNumber, left: false });
      s.tableMarks.push({
        teamId,
        personId,
        addedAtGameId: player.gameId,
        needsReview: player.needsReview,
      });
      return 'added';
    },
    setTablePlayerNumber: async (entryId, jerseyNumber) => {
      const { teamId, personId } = split(entryId);
      if (worn(teamId, personId, jerseyNumber)) return 'jersey-taken';
      const same = (p: { teamId: string; personId: string }) =>
        p.teamId === teamId && p.personId.toLowerCase() === personId;
      s.players = s.players.map((p) => (same(p) ? { ...p, jerseyNumber } : p));
      s.roster = s.roster.map((r) => (same(r) && !r.left ? { ...r, jerseyNumber } : r));
      return 'changed';
    },
    renameTablePlayer: async (personId, firstName, lastName) => {
      s.roster = s.roster.map((r) =>
        r.personId.toLowerCase() === personId ? { ...r, firstName, lastName } : r,
      );
    },
    removeTablePlayer: async (entryId, personId) => {
      const { teamId } = split(entryId);
      if ([...s.liveLines, ...s.lines].some((l) => l.personId.toLowerCase() === personId)) {
        return 'has-lines';
      }
      const other = (p: { teamId: string; personId: string }) =>
        !(p.teamId === teamId && p.personId.toLowerCase() === personId);
      s.players = s.players.filter(other);
      s.roster = s.roster.filter(other);
      s.tableMarks = s.tableMarks.filter(other);
      return 'removed';
    },
  };
}

/** The game's teams, read as the database's players query reads them. */
const teamsOf = (s: MemoryGames, gameId: string) => {
  const game = s.games.find((g) => g.id === gameId);
  return game === undefined ? [] : [game.homeTeamId, game.awayTeamId];
};

/** The live game over one state. */
export function liveGamesOf(s: MemoryTracker): LiveGamesStore {
  return {
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
    lines: async (gameId) => structuredClone(s.liveLines.filter((l) => l.gameId === gameId)),
    saveLines: async (gameId, lines, removed) => {
      const replaced = new Set([...removed, ...lines.map((l) => l.personId)]);
      s.liveLines = [
        ...s.liveLines.filter((l) => !(l.gameId === gameId && replaced.has(l.personId))),
        ...structuredClone(lines),
      ];
    },
    ...tablePlayersOf(s),
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
  // The session commands take the same lock, so a takeover and a batch race for real.
  scoringSessions: sessionsOf(s, lock === undefined ? {} : { lockGame: lock }),
  liveGames: liveGamesOf(s),
});

/**
 * Each transaction works on a copy, kept only if it returns (nothing kept on a
 * refusal). The games module's announcements are kept in `events`, after `handlers`
 * (none unless given) have run in the command's transaction.
 */
export function memoryTracker(
  state: Partial<MemoryTracker> = {},
  handlers: readonly EventHandler<TrackerTx>[] = [],
) {
  const db = memoryDatabase<MemoryTracker>(initialTracker(state));
  const clock = testClock();
  const transaction = memoryTransaction(db, (s, jobs) => trackerTxOf(s, jobs, clock));
  const events: DomainEvent[] = [];
  const keep: EventHandler<TrackerTx>[] = ['games.finalized', 'games.reopened'].map((type) => ({
    type,
    handle: async (event) => void events.push(event),
  }));
  const deps = testDeps(transaction, [...handlers, ...keep]);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, clock, events };
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
