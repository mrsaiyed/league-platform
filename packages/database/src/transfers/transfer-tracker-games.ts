// The Al-Hadi transfer's wiring (step 2.58, F-7): reads a backup of the current live
// tracker (readTrackerBackup, step 2.57), works out the plan for one league and season
// in a local PGlite database, and, unless it is a dry run, carries it out with the
// product's own commands, acting as one account of that league. The plan, the replay
// and the comparing are the imports module's (packages/core); this file only finds the
// league, the season and the account, and gives the module its reads and its commands'
// transaction.
//
// Made-up data only (T-201): it takes a PGlite, never an address, so it cannot reach a
// hosted database. The tracker's names are read to match people and to print, and are
// stored only as the names of the people it adds; box score lines hold ids (T-220).
import type { PGlite } from '@electric-sql/pglite';
import {
  eventHandlers,
  mayTransferTrackerGames,
  planTrackerTransfer,
  rulesOfGame,
  runTrackerTransfer,
  systemClock,
  type Clock,
  type CommandContext,
  type CommandDeps,
  type StandingsTx,
  type TrackerTransferReads,
  type TrackerTransferTx,
  type TransferPlan,
  type TransferReport,
} from '@srleagues/core';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { listPublicGames } from '../queries/list-public-games.ts';
import {
  accessStore,
  activityLogStore,
  gamesStore,
  importsStore,
  jobsStore,
  liveGamesStore,
  peopleStore,
  scoringSessionsStore,
  standingsStore,
  teamsStore,
} from '../stores/index.ts';
import { readTrackerBackup } from './read-tracker-backup.ts';
import type { TrackerBackup } from './tracker-backup.ts';

export type TransferTrackerGamesOptions = {
  /** The platform's local database, with every migration applied. */
  readonly pglite: PGlite;
  /** The backup folder `npm run stats:copy -- --to <folder>` wrote. */
  readonly backupFolder: string;
  /** A folder of the caller's own for the reader's working copy (step 2.57). */
  readonly workDir: string;
  /** The league's short name. */
  readonly league: string;
  /** The season's short name or its name. */
  readonly season: string;
  /** The email of the league's account the transfer acts as (an admin). */
  readonly actorEmail: string;
  /** True: work out and show the plan, change nothing. */
  readonly dryRun: boolean;
  /** Bring in the other teams' players the transferred games name, too. */
  readonly withOpponents: boolean;
  /** The server's clock; the system's by default. */
  readonly clock?: Clock;
};

/** Why the transfer could not start: what it was told to find is not there. */
export type TransferSetupProblem =
  /** The database was named by an address: the transfer works on a local folder only (T-201). */
  | { readonly kind: 'address-not-allowed' }
  /** The folder holds no database. */
  | { readonly kind: 'no-database' }
  | { readonly kind: 'league-not-found' }
  | { readonly kind: 'season-not-found' }
  | { readonly kind: 'several-seasons' }
  | { readonly kind: 'account-not-found' }
  /**
   * The account may not run the transfer in this league: it is not its owner or an admin
   * for the whole league (another league's admin included), or the league is read-only.
   */
  | { readonly kind: 'not-allowed' };

export type TransferOutcome =
  | { readonly ok: false; readonly problem: TransferSetupProblem }
  | {
      readonly ok: true;
      readonly backup: TrackerBackup;
      readonly timeZone: string;
      readonly plan: TransferPlan;
      /** Null for a dry run. */
      readonly report: TransferReport | null;
    };

type Tx = TrackerTransferTx & StandingsTx;

/** The transaction every transfer command runs in, with the apps' event handlers. */
function depsOf(db: DatabaseHandle, clock: Clock): CommandDeps<Tx> {
  return {
    transaction: commandTransaction(db, (scope: LeagueScope) => ({
      jobs: jobsStore(scope),
      games: gamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      liveGames: liveGamesStore(scope),
      clock,
      standings: standingsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
      people: peopleStore(scope),
      teams: teamsStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => clock.now(),
  };
}

/** What the plan reads, each read in its own transaction for the league. */
async function readsOf(
  db: DatabaseHandle,
  context: CommandContext,
  seasonId: string,
  timeZone: string,
): Promise<TrackerTransferReads> {
  const scoped = <T>(work: (scope: LeagueScope) => Promise<T>) =>
    withTransaction(
      db,
      { leagueId: context.leagueId, accountId: context.accountId ?? undefined },
      work,
    );
  const names = await scoped((scope) => importsStore(scope).seasonNames(seasonId));
  const games = await scoped((scope) => listPublicGames(scope, seasonId));
  const season = await scoped((scope) => gamesStore(scope).findSeason(seasonId));
  return {
    timeZone,
    uniqueJerseys: rulesOfGame(null, season?.rules).rosters.uniqueJerseys,
    peopleOffRosters: (name) =>
      scoped(async (scope) => {
        const people = peopleStore(scope);
        const found: { personId: string; firstName: string; lastName: string }[] = [];
        const page = 100;
        for (let offset = 0; ; offset += page) {
          const listed = await people.list({ search: name, limit: page, offset, sensitive: false });
          for (const person of listed) {
            if (await people.isOnRoster(person.id)) continue;
            found.push({
              personId: person.id,
              firstName: person.firstName,
              lastName: person.lastName,
            });
          }
          if (listed.length < page) return found;
        }
      }),
    teams: names.teams.map((team) => ({ id: team.id, name: team.name })),
    games: games.map((game) => ({
      id: game.id,
      number: game.number,
      localDate: game.localDate,
      homeTeamId: game.homeTeam.id,
      awayTeamId: game.awayTeam.id,
      status: game.status,
    })),
    roster: (teamId) =>
      scoped(async (scope) =>
        (await teamsStore(scope).listRoster(teamId)).map((entry) => ({
          personId: entry.personId,
          firstName: entry.firstName,
          lastName: entry.lastName,
          publicName: entry.publicName,
          jerseyNumber: entry.jerseyNumber,
          role: entry.role,
          joinedOn: entry.joinedOn,
          leftOn: entry.leftOn,
        })),
      ),
    game: (gameId, commandIds) =>
      scoped(async (scope) => {
        const store = gamesStore(scope);
        const game = await store.find(gameId);
        if (game === undefined || game.binned) return undefined;
        const live = liveGamesStore(scope);
        const state = await live.findState(gameId);
        const taken = commandIds.length === 0 ? [] : await live.takenCommands(gameId, commandIds);
        const season = await store.findSeason(game.seasonId);
        return {
          status: game.status,
          version: game.version,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          tracked: state !== undefined,
          taken: new Set(taken.map((id) => id.toLowerCase())),
          rules: rulesOfGame(game.format, season?.rules),
        };
      }),
    lines: (gameId) => scoped((scope) => liveGamesStore(scope).lines(gameId)),
  };
}

/**
 * Finds the league, season and account, checks the account may run the transfer there,
 * plans it and, unless a dry run, runs it.
 */
export async function transferTrackerGames(
  options: TransferTrackerGamesOptions,
): Promise<TransferOutcome> {
  const { pglite } = options;
  const league = (
    await pglite.query<{ id: string; time_zone: string }>(
      'select id, time_zone from leagues where slug = $1 and deleted_at is null',
      [options.league],
    )
  ).rows[0];
  if (league === undefined) return { ok: false, problem: { kind: 'league-not-found' } };
  const seasons = (
    await pglite.query<{ id: string }>(
      `select id from seasons
       where league_id = $1 and deleted_at is null and (slug = $2 or lower(name) = lower($2))`,
      [league.id, options.season],
    )
  ).rows;
  const season = seasons[0];
  if (season === undefined) return { ok: false, problem: { kind: 'season-not-found' } };
  if (seasons.length > 1) return { ok: false, problem: { kind: 'several-seasons' } };
  const account = (
    await pglite.query<{ id: string }>('select id from accounts where lower(email) = lower($1)', [
      options.actorEmail,
    ])
  ).rows[0];
  if (account === undefined) return { ok: false, problem: { kind: 'account-not-found' } };

  const clock = options.clock ?? systemClock;
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const context: CommandContext = {
      leagueId: league.id,
      accountId: account.id,
      requestId: 'tracker-transfer',
    };
    // Checked before the backup is read or a plan worked out: an account that may not
    // run it is shown nothing of the league or the backup, dry run or not.
    const allowed = await withTransaction(
      db,
      { leagueId: league.id, accountId: account.id },
      (scope) =>
        mayTransferTrackerGames(context, { jobs: jobsStore(scope), access: accessStore(scope) }),
    );
    if (!allowed) return { ok: false, problem: { kind: 'not-allowed' } };
    const backup = await readTrackerBackup(options.backupFolder, { workDir: options.workDir });
    const reads = await readsOf(db, context, season.id, league.time_zone);
    const planOptions = { withOpponents: options.withOpponents, now: clock.now() };
    const plan = await planTrackerTransfer(backup, reads, planOptions);
    const report = options.dryRun
      ? null
      : await runTrackerTransfer({
          context,
          deps: depsOf(db, clock),
          reads,
          plan,
          options: planOptions,
        });
    return { ok: true, backup, timeZone: league.time_zone, plan, report };
  } finally {
    await db.close();
  }
}
