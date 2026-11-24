// THE STAND-IN'S ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// One set of in-memory rows per made-up league (stand-in-world-state.ts), behind every
// area's ports: the admin's teams, the schedule grid, the fixture import, the games area,
// the tracker's endpoints, League settings and the public pages all read and write the
// same rows, so what an admin does is what a visitor sees (step 2.152). The product's own
// commands run on it, and core's own event handlers with them: a result rebuilds the
// season's standings and player totals in the same transaction, as on the database.
//
// Transactions: one at a time, for every league (a queue). Each starts from a shallow copy
// of its league, sharing every table with the world as it stands; a store never changes a
// table in place but gives it a new array (stand-in-world-rows.ts), so only the tables a
// transaction writes are copied. The copy is kept only if the work returns (a command
// throws to roll back, so a refused or failed command leaves nothing behind); the world's
// own rows are frozen, so nothing but a kept transaction can change them, and a page reads
// them once the transactions before it have ended, never half a change. A league's rows are
// only ever read and written through its own id (T-28): one league's world never reaches
// another's pages. The world lives in this process's memory: it is made again from the
// seed (stand-in-world-seed.ts) every time the server starts.
import {
  eventHandlers,
  importsRunJob,
  pageOfActivity,
  readFixtureImport,
  rebuildSeason,
  systemClock,
  type AccessReader,
  type ActivityLog,
  type Audience,
  type BinTx,
  type Clock,
  type CommandContext,
  type CommandLogLine,
  type CommandTx,
  type EventHandler,
  type ImportScoresTx,
  type Job,
  type LeaguesTx,
  type PeopleTx,
  type SchedulingTx,
  type StandingsTx,
  type TeamsTx,
  type ScorekeepersTx,
  type TrackerTx,
  type TransactionRunner,
} from '@srleagues/core';
import { AsyncLocalStorage } from 'node:async_hooks';
import { worldBinStore } from './stand-in-world-bin.ts';
import { worldGamesStore, worldLiveGames, worldScoringSessions } from './stand-in-world-games.ts';
import { deepFreeze } from './stand-in-world-rows.ts';
import { worldImportsStore, worldSchedulingStore } from './stand-in-world-scheduling.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';
import { worldLeaguesStores, worldStandingsStore } from './stand-in-world-standings.ts';
import { worldPeopleStore, worldTeamsStore } from './stand-in-world-teams.ts';

/** Every store of every module, in one transaction: what the database's transaction offers. */
export type WorldTx = TrackerTx &
  ScorekeepersTx &
  StandingsTx &
  TeamsTx &
  PeopleTx &
  SchedulingTx &
  ImportScoresTx &
  LeaguesTx &
  BinTx;

/** What every area's transaction has: the core handlers find the rest of the world from it. */
type AnyAreaTx = CommandTx & { readonly activity: ActivityLog };

/** A value as a page is given it: read only, all the way down. */
export type Frozen<T> = T extends readonly (infer Item)[]
  ? readonly Frozen<Item>[]
  : T extends object
    ? { readonly [K in keyof T]: Frozen<T[K]> }
    : T;

/** A league's rows as a page reads them. */
export type ReadWorld = Frozen<LeagueWorld>;

/**
 * The commands' dependencies on the world, for any area: its transaction offers every
 * store, so it fits each area's narrower transaction, and so do the handlers.
 */
export type WorldDeps = {
  readonly transaction: TransactionRunner<WorldTx>;
  readonly events: readonly EventHandler<AnyAreaTx>[];
  readonly log: (line: CommandLogLine) => void;
  readonly now: () => number;
};

export type WorldOptions = {
  /** The made-up leagues and everything they hold to begin with (stand-in-world-seed.ts). */
  readonly leagues: readonly LeagueWorld[];
  /** What a permission check reads for one league: its owner, state and grants. */
  readonly accessOf: (leagueId: string) => AccessReader;
  /**
   * Every grant in force in one league, for who may be assigned to score (step 2.56); a
   * world given none knows only the owner as one.
   */
  readonly listGrantsOf?: (leagueId: string) => ScorekeepersTx['access']['listGrants'];
  /** Where the commands' T-196 lines go. */
  readonly log: (line: CommandLogLine) => void;
  /**
   * The server's clock (the system's where not given): the one clock of the world's
   * leases (T-116), stamps, today and how long ago a game ended, so they never disagree.
   */
  readonly clock?: Clock;
};

export type World = {
  /**
   * The league's rows once every transaction asked for before has ended, or undefined
   * for a league with none: what a page reads. Frozen: a reader cannot change them.
   */
  readonly read: (leagueId: string) => Promise<ReadWorld | undefined>;
  /** Who plays in the league, or undefined for a league with no world (it never changes). */
  readonly audienceOf: (leagueId: string) => Audience | undefined;
  readonly deps: WorldDeps;
  readonly now: () => Date;
  readonly clock: Clock;
};

/** Asked for inside a transaction, the world would wait for that transaction forever. */
export class WorldReentered extends Error {
  constructor(what: string) {
    super(
      `The made-up world was asked to ${what} inside one of its own transactions, which would never end.`,
    );
    this.name = 'WorldReentered';
  }
}

const refused = (result: unknown) =>
  typeof result === 'object' && result !== null && 'ok' in result && result.ok === false;

/** Keeps a transaction's copy as the world: the tables it wrote, frozen, and the league. */
function kept(before: LeagueWorld, draft: LeagueWorld): LeagueWorld {
  for (const key of Object.keys(draft) as (keyof LeagueWorld)[]) {
    if (draft[key] !== before[key]) deepFreeze(draft[key]);
  }
  return Object.freeze(draft);
}

export function madeUpWorld(options: WorldOptions): World {
  // One clock for everything the world does: leases, stamps, today, "how long ago".
  const clock = options.clock ?? systemClock;
  const now = () => new Date(clock.now());
  const states = new Map<string, LeagueWorld>(
    options.leagues.map((league) => [league.leagueId, deepFreeze(structuredClone(league))]),
  );
  // Which world transaction an area's transaction is: the handlers need every store.
  const opened = new WeakMap<ActivityLog, WorldTx>();
  // Set while a transaction's work runs, so the world notices being asked for inside it.
  const inside = new AsyncLocalStorage<true>();

  const txOf = (leagueId: string, s: LeagueWorld, jobs: Job[]): WorldTx => {
    const reader = options.accessOf(leagueId);
    const access: ScorekeepersTx['access'] = {
      ownerAccountId: reader.ownerAccountId,
      leagueStatus: reader.leagueStatus,
      activeGrantsOf: reader.activeGrantsOf,
      listGrants: options.listGrantsOf?.(leagueId) ?? (async () => []),
    };
    const activity: ActivityLog = {
      // An id that grows with each entry, so entries of the same moment keep their order.
      record: async (entry) => {
        const id = `01900000-0000-7000-8000-${String(s.activity.length + 1).padStart(12, '0')}`;
        s.activity = [...s.activity, { ...entry, id, at: now().toISOString() }];
      },
      list: async (limit, before, scope, search) =>
        pageOfActivity(s.activity, limit, before, scope, search),
    };
    const tx: WorldTx = {
      jobs: { enqueue: async (job) => void jobs.push(job) },
      access,
      activity,
      clock,
      games: worldGamesStore(s, now),
      scoringSessions: worldScoringSessions(s),
      liveGames: worldLiveGames(s, now),
      standings: worldStandingsStore(s),
      teams: worldTeamsStore(s, now),
      people: worldPeopleStore(s, now),
      bin: worldBinStore(s, now),
      scheduling: worldSchedulingStore(s),
      imports: worldImportsStore(s, now),
      ...worldLeaguesStores(s, access, now),
    };
    opened.set(activity, tx);
    return tx;
  };

  // One transaction at a time, as the database's locks would hold the others.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(leagueId: string, work: (tx: WorldTx) => Promise<T>) => {
    if (inside.getStore() === true) throw new WorldReentered('run a transaction');
    const run = queue.then(async () => {
      const known = states.get(leagueId);
      if (known === undefined) {
        throw new Error(`No made-up league has the id ${leagueId}: nothing would be kept.`);
      }
      const draft: LeagueWorld = { ...known };
      const jobs: Job[] = [];
      const result = await inside.run(true, () => work(txOf(leagueId, draft, jobs)));
      // Kept only when the work returned and did not refuse.
      if (refused(result)) return { result, jobs: [] };
      states.set(leagueId, kept(known, draft));
      return { result, jobs };
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const transaction: TransactionRunner<WorldTx> = async <T>(
    context: CommandContext,
    work: (tx: WorldTx) => Promise<T>,
  ) => {
    const leagueId = context.leagueId.toLowerCase();
    const { result, jobs } = await inTurn(leagueId, work);
    // The worker's turn: each kept `imports.run` job reads its file once, in its own
    // transaction for the job's league, acting for nobody (T-226), as the worker would
    // moments later. The command is kept whatever happens next, so a read that fails
    // leaves the file waiting to be read, as a failed job of the worker would; the page
    // then shows it still reading, and it can be forgotten (discardFixtureImport). Other
    // jobs (emails) have no worker here and are dropped.
    for (const job of jobs) {
      const importId = job.ids['importId'];
      if (job.type === importsRunJob && importId !== undefined && job.leagueId === leagueId) {
        await inTurn(leagueId, (tx) => readFixtureImport(tx, importId)).catch(() => undefined);
      }
    }
    return result;
  };

  // Core's handlers (standings follow every result, T-24), each given the whole world
  // transaction its command runs in, with the command's own checked job queue.
  const events: readonly EventHandler<AnyAreaTx>[] = eventHandlers.map((handler) => ({
    type: handler.type,
    handle: async (event, tx) => {
      const whole = opened.get(tx.activity);
      if (whole === undefined) throw new Error('A transaction that is not the made-up world’s.');
      await handler.handle(event, { ...whole, jobs: tx.jobs });
    },
  }));

  // The seed's standings and player totals are worked out from its results by core's own
  // rebuild, as the database's would be: never written by hand.
  // A seed that cannot be worked out is an error on every page that reads the world.
  const seeded = Promise.all(
    options.leagues.flatMap((league) =>
      league.seasons.map((season) => inTurn(league.leagueId, (tx) => rebuildSeason(tx, season.id))),
    ),
  );
  seeded.catch(() => undefined);

  return {
    read: async (leagueId) => {
      if (inside.getStore() === true) throw new WorldReentered('be read');
      await seeded;
      await queue;
      return states.get(leagueId.toLowerCase());
    },
    audienceOf: (leagueId) => states.get(leagueId.toLowerCase())?.audience,
    deps: { transaction, events, log: options.log, now: () => performance.now() },
    now,
    clock,
  };
}
