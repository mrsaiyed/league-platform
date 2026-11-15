// THE STAND-IN'S ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// One set of in-memory rows per made-up league (stand-in-world-state.ts), behind every
// area's ports: the admin's teams, the schedule grid, the fixture import, the games area,
// the tracker's endpoints, League settings and the public pages all read and write the
// same rows, so what an admin does is what a visitor sees (step 2.152). The product's own
// commands run on it, and core's own event handlers with them: a result rebuilds the
// season's standings and player totals in the same transaction, as on the database.
//
// Transactions: one at a time, for every league (a queue), each on a copy of its league's
// rows. The copy is kept only if the work returns (a command throws to roll back, so a
// refused or failed command leaves nothing behind); a page reading meanwhile sees the
// rows as they were before, never half a change. A league's rows are only ever read and
// written through its own id (T-28): one league's world never reaches another's pages.
// The world lives in this process's memory: it is made again from the seed
// (stand-in-world-seed.ts) every time the server starts.
import {
  eventHandlers,
  importsRunJob,
  readFixtureImport,
  rebuildSeason,
  systemClock,
  type AccessReader,
  type ActivityLog,
  type Audience,
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
  type TrackerTx,
  type TransactionRunner,
} from '@srleagues/core';
import { worldGamesStore, worldLiveGames, worldScoringSessions } from './stand-in-world-games.ts';
import { worldImportsStore, worldSchedulingStore } from './stand-in-world-scheduling.ts';
import { emptyLeagueWorld, type LeagueWorld } from './stand-in-world-state.ts';
import { worldLeaguesStores, worldStandingsStore } from './stand-in-world-standings.ts';
import { worldPeopleStore, worldTeamsStore } from './stand-in-world-teams.ts';

/** Every store of every module, in one transaction: what the database's transaction offers. */
export type WorldTx = TrackerTx &
  StandingsTx &
  TeamsTx &
  PeopleTx &
  SchedulingTx &
  ImportScoresTx &
  LeaguesTx;

/** What every area's transaction has: the core handlers find the rest of the world from it. */
type AnyAreaTx = CommandTx & { readonly activity: ActivityLog };

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
  /** Where the commands' T-196 lines go. */
  readonly log: (line: CommandLogLine) => void;
  /** The server's clock as a date: today, game times, stamps. */
  readonly now?: () => Date;
  /** The server's clock for leases (T-116). */
  readonly clock?: Clock;
};

export type World = {
  /**
   * The league's rows once every transaction asked for before has ended, or undefined
   * for a league with none: what a page reads. Read only.
   */
  readonly read: (leagueId: string) => Promise<LeagueWorld | undefined>;
  /** Who plays in the league, or undefined for a league with no world (it never changes). */
  readonly audienceOf: (leagueId: string) => Audience | undefined;
  readonly deps: WorldDeps;
  readonly now: () => Date;
  readonly clock: Clock;
};

const refused = (result: unknown) =>
  typeof result === 'object' && result !== null && 'ok' in result && result.ok === false;

export function madeUpWorld(options: WorldOptions): World {
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? systemClock;
  const states = new Map<string, LeagueWorld>(
    options.leagues.map((league) => [league.leagueId, structuredClone(league)]),
  );
  // Which world transaction an area's transaction is: the handlers need every store.
  const opened = new WeakMap<ActivityLog, WorldTx>();

  const txOf = (leagueId: string, s: LeagueWorld, jobs: Job[]): WorldTx => {
    const access = options.accessOf(leagueId);
    const activity: ActivityLog = {
      record: async (entry) => void s.activity.push(entry),
      list: async () => [],
    };
    const games = worldGamesStore(s, now);
    const tx: WorldTx = {
      jobs: { enqueue: async (job) => void jobs.push(job) },
      access,
      activity,
      clock,
      games,
      scoringSessions: worldScoringSessions(s),
      liveGames: worldLiveGames(s, now),
      standings: worldStandingsStore(s),
      teams: worldTeamsStore(s),
      people: worldPeopleStore(s),
      scheduling: worldSchedulingStore(s),
      imports: worldImportsStore(s, now),
      ...worldLeaguesStores(s, access),
    };
    opened.set(activity, tx);
    return tx;
  };

  // One transaction at a time, as the database's locks would hold the others.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(leagueId: string, work: (tx: WorldTx) => Promise<T>) => {
    const run = queue.then(async () => {
      const known = states.get(leagueId);
      const draft = structuredClone(
        known ??
          emptyLeagueWorld(leagueId, { audience: 'youth', timeZone: 'UTC', minimumGames: 0 }),
      );
      const jobs: Job[] = [];
      const result = await work(txOf(leagueId, draft, jobs));
      // Kept only when the work returned and did not refuse; a league with no world keeps nothing.
      if (refused(result) || known === undefined) return { result, jobs: [] };
      states.set(leagueId, draft);
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
    // moments later. Other jobs (emails) have no worker here and are dropped.
    for (const job of jobs) {
      const importId = job.ids['importId'];
      if (job.type === importsRunJob && importId !== undefined && job.leagueId === leagueId) {
        await inTurn(leagueId, (tx) => readFixtureImport(tx, importId));
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
      await seeded;
      const before = queue;
      await before;
      return states.get(leagueId.toLowerCase());
    },
    audienceOf: (leagueId) => states.get(leagueId.toLowerCase())?.audience,
    deps: { transaction, events, log: options.log, now: () => performance.now() },
    now,
    clock,
  };
}
