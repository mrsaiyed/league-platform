// The live game's storage (step 2.29) on plain objects, for core's tests of the
// tracker's commands. The same command runs against the real database in
// packages/database (stores/tracker-commands.test.ts and the two-league harness). The
// database's own rules for events (each command id and seq once per game, seq with no
// gaps) are stood in for by the checks made here.
//
// `lockingTracker` runs transactions over one shared state with a real lock per game,
// to show batches for different games never wait for each other (T-112): PGlite has
// one connection and runs transactions one after another, so it cannot show that.
import { refusedAddEventType } from '@srleagues/contracts';
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
import { hasPlaysPastMarker } from './plays-past-marker.ts';
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
  /** The season wants unique numbers on a team (0008), as the database reads it. */
  uniqueJerseys: boolean;
  /** People sent to the bin by taking them off at the table (T-45). */
  binnedPeople: string[];
  /** Ids of people of another league: an id the database would refuse. */
  otherLeaguePeople: string[];
  /** The names people had before a rename at the table (0015). */
  previousNames: { personId: string; firstName: string; lastName: string }[];
  /** Every write of a change of players fails, as a database fault would. */
  failWrites: boolean;
  /** A rename fails, as a database fault would; any number in the same change with it. */
  failRenames: boolean;
};

const initialTracker = (state: Partial<MemoryTracker>): MemoryTracker => ({
  ...initialScoring({}),
  states: [],
  events: [],
  liveLines: [],
  players: [],
  tableMarks: [],
  uniqueJerseys: false,
  binnedPeople: [],
  otherLeaguePeople: [],
  previousNames: [],
  failWrites: false,
  failRenames: false,
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
  | 'changeTablePlayer'
  | 'removeTablePlayer'
  | 'lastEventSeq'
  | 'refusedAdds'
> {
  const split = (entryId: string) => {
    const [teamId = '', personId = ''] = entryId.split('|');
    return { teamId, personId };
  };
  const reviewing = (teamId: string, personId: string) =>
    s.tableMarks.some((m) => m.teamId === teamId && m.personId === personId && m.needsReview);
  // 0015: an entry waiting for review is neither checked nor counted.
  const worn = (teamId: string, personId: string, jersey: string | null) =>
    s.uniqueJerseys &&
    jersey !== null &&
    !reviewing(teamId, personId) &&
    s.roster.some(
      (r) =>
        r.teamId === teamId &&
        !r.left &&
        r.jerseyNumber === jersey &&
        r.personId !== personId &&
        !reviewing(teamId, r.personId),
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
        needsReview: mark?.needsReview ?? false,
      };
    },
    addTablePlayer: async (player) => {
      const ids = [
        ...s.players,
        ...s.roster,
        ...s.binnedPeople.map((personId) => ({ personId })),
      ].map((p) => p.personId.toLowerCase());
      if (ids.includes(player.personId) || s.otherLeaguePeople.includes(player.personId)) {
        return 'id-taken';
      }
      if (s.failWrites) return 'failed';
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
    changeTablePlayer: async (entryId, personId, change) => {
      const { teamId } = split(entryId);
      const renaming = change.firstName !== undefined || change.lastName !== undefined;
      if (s.failWrites || (renaming && s.failRenames)) return 'failed';
      const jerseyNumber = change.jerseyNumber;
      if (jerseyNumber !== undefined && worn(teamId, personId, jerseyNumber)) {
        return 'jersey-taken';
      }
      const same = (p: { teamId: string; personId: string }) =>
        p.teamId === teamId && p.personId.toLowerCase() === personId;
      if (jerseyNumber !== undefined) {
        s.players = s.players.map((p) => (same(p) ? { ...p, jerseyNumber } : p));
        s.roster = s.roster.map((r) => (same(r) && !r.left ? { ...r, jerseyNumber } : r));
      }
      if (renaming) {
        const before = s.roster.find((r) => r.personId.toLowerCase() === personId);
        // The first name given is kept, the first time only (0015).
        const kept = s.previousNames.some((n) => n.personId === personId);
        if (before !== undefined && !kept) {
          s.previousNames.push({
            personId,
            firstName: before.firstName,
            lastName: before.lastName,
          });
        }
        s.roster = s.roster.map((r) =>
          r.personId.toLowerCase() === personId
            ? {
                ...r,
                firstName: change.firstName ?? r.firstName,
                lastName: change.lastName ?? r.lastName,
              }
            : r,
        );
      }
      return 'changed';
    },
    removeTablePlayer: async (entryId, personId, gameId, thisGameToo) => {
      const { teamId } = split(entryId);
      // This game's lines only while it has no engine state: else they follow its plays.
      const theirs = [...s.liveLines, ...s.lines].filter(
        (l) => l.personId.toLowerCase() === personId,
      );
      if (theirs.some((l) => l.gameId !== gameId)) return 'has-lines';
      if (thisGameToo && theirs.length > 0) return 'in-box-score';
      if (s.failWrites) return 'failed';
      const other = (p: { teamId: string; personId: string }) =>
        !(p.teamId === teamId && p.personId.toLowerCase() === personId);
      s.players = s.players.filter(other);
      s.roster = s.roster.filter(other);
      s.tableMarks = s.tableMarks.filter(other);
      // To the bin (T-45), not gone: the person can be brought back.
      s.binnedPeople.push(personId);
      return 'removed';
    },
    refusedAdds: async (gameId) =>
      s.events
        .filter((e) => e.gameId === gameId && e.type === refusedAddEventType)
        .map((e) => ({
          commandId: e.commandId,
          playerId: String(e.payload['playerId'] ?? ''),
          problem: String(e.payload['problem'] ?? ''),
        })),
    lastEventSeq: async (gameId) =>
      Math.max(0, ...s.events.filter((e) => e.gameId === gameId).map((e) => e.seq)),
  };
}

/** The game's teams, read as the database's players query reads them. */
const teamsOf = (s: MemoryGames, gameId: string) => {
  const game = s.games.find((g) => g.id === gameId);
  return game === undefined ? [] : [game.homeTeamId, game.awayTeamId];
};

/**
 * The live game over one state. `databaseNow` stands in for the database's own clock,
 * which measures how long ago a game was decided.
 */
export function liveGamesOf(s: MemoryTracker, databaseNow: () => number): LiveGamesStore {
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
    wasDecided: async (gameId) =>
      s.corrections.some((c) => c.gameId === gameId) ||
      s.events.some((e) => e.gameId === gameId && (e.type === 'end' || e.type === 'reopen')),
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
    findLastEnd: async (gameId) => {
      const end = s.events.filter((e) => e.gameId === gameId && e.type === 'end').at(-1);
      return end === undefined ? undefined : { accountId: end.accountId };
    },
    endedAgo: async (gameId) => {
      const decided = s.games.find((g) => g.id === gameId)?.finalizedAt;
      return decided === null || decided === undefined
        ? undefined
        : Math.max(0, databaseNow() - Date.parse(decided));
    },
    decidedBy: async (gameId) => s.deciders[gameId] ?? null,
    handResults: async (gameIds) => {
      s.handResultReads += 1;
      return s.games
        .filter((g) => gameIds.includes(g.id) && !g.binned)
        .map((g) => ({
          gameId: g.id,
          status: g.status,
          decidedBy: s.deciders[g.id] ?? null,
          ago:
            g.finalizedAt === null || g.finalizedAt === undefined
              ? undefined
              : Math.max(0, databaseNow() - Date.parse(g.finalizedAt)),
          overturned: g.overturned === true,
          tracked:
            s.states.some((x) => x.gameId === g.id) &&
            (s.tracked.includes(g.id) || hasPlaysPastMarker(s.events, g.id)),
        }));
    },
    findEvent: async (gameId, commandId) => {
      const found = s.events.find((e) => e.gameId === gameId && e.commandId === commandId);
      return found === undefined
        ? undefined
        : { seq: found.seq, type: found.type, accountId: found.accountId };
    },
    ...tablePlayersOf(s),
  };
}

const trackerTxOf = (
  s: MemoryTracker,
  jobs: JobQueue,
  clock: ReturnType<typeof testClock>,
  lock?: (gameId: string) => Promise<void>,
): TrackerTx =>
  withPlaysFromEvents(s, {
    ...gamesTxOf(s, jobs),
    clock,
    // The session commands take the same lock, so a takeover and a batch race for real.
    scoringSessions: sessionsOf(s, lock === undefined ? {} : { lockGame: lock }),
    // The stand-in's database keeps the test's clock.
    liveGames: liveGamesOf(s, clock.now),
  });

/**
 * Whether a game has plays, as the database reads it (game-has-plays.ts): a play since
 * its last "not started" marker, never a change of players (hasPlaysPastMarker), or a
 * game the test marks as tracked.
 */
function withPlaysFromEvents(s: MemoryTracker, tx: TrackerTx): TrackerTx {
  return {
    ...tx,
    games: {
      ...tx.games,
      hasPlays: async (gameId) =>
        s.tracked.includes(gameId) || hasPlaysPastMarker(s.events, gameId),
      // The game's one lock, as the database has it: the games store and the session
      // commands take the same (T-111), so a result typed by hand and a batch race for real.
      lockGame: (gameId) => tx.scoringSessions.lockGame(gameId),
    },
  };
}

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
