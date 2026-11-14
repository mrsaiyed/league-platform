// Automatic pickup (T-65): a new query or command cannot skip the two-league
// harness. Every function the package exports (index.ts), and every function
// exported anywhere under the scanned folders (this package's queries and stores),
// has a registered case or is listed below with the reason it reaches no league
// data. Adding to that list is a review. Every command exported anywhere in core
// (a function carrying `commandName`) must have a case and be in core's registry,
// which the apps use.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands, eventHandlers } from '@srleagues/core';
import { beforeAll, describe, expect, it } from 'vitest';
import * as databasePackage from '../../index.ts';
import {
  grantFromRow,
  invitationFromRow,
  invitationStatus,
  scopeColumns,
} from '../queries/access-rows.ts';
import { constraintOf } from '../queries/constraint-of.ts';
import { currentLeague } from '../queries/find-current-league.ts';
import { leagueStatusOf } from '../queries/league-status-of.ts';
import { divisionSummary } from '../queries/division-summary.ts';
import { gameSummary } from '../queries/game-summary.ts';
import { statCounts } from '../queries/list-decided-game-lines.ts';
import { personSummary, personSummaryWithSensitive } from '../queries/person-summary.ts';
import { rosterEntrySummary } from '../queries/roster-entry-summary.ts';
import { scoringSessionSummary } from '../queries/scoring-session-summary.ts';
import { teamSummary } from '../queries/team-summary.ts';
import { programSummary } from '../queries/program-summary.ts';
import { courtSummary, venueSummary } from '../queries/venue-summary.ts';
import './isolation-cases.test-helper.ts';
import {
  exportedFunctions,
  scanModules,
  uncoveredFunctions,
  type ExportedFunction,
  type ScannedModules,
} from './isolation-coverage.test-helper.ts';
import { registeredIsolationCases } from './isolation-registry.test-helper.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Paths from packages/database. */
const scanned = ['index.ts', 'src/queries', 'src/stores'];
/** All of core, searched for commands and event handlers. */
const coreScanned = ['../core/index.ts', '../core/src'];

/** Exported functions that read or write no league data, and why. */
const reachNoLeagueData = new Map<unknown, string>([
  [programSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [gameSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [statCounts, 'turns a stats document already read into counts; runs no SQL'],
  [personSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [personSummaryWithSensitive, 'turns a row already read into the returned shape; runs no SQL'],
  [divisionSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [venueSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [courtSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [teamSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [
    databasePackage.seedLeaguesInto,
    'development-only bootstrap: takes a PGlite, not a scope; runs the scoped commands (own cases) per league and writes accounts and role grants directly',
  ],
  [rosterEntrySummary, 'turns a row already read into the returned shape; runs no SQL'],
  [databasePackage.binStore, 'binds the bin queries (own cases) to a scope'],
  [databasePackage.teamsStore, 'binds the team queries, each with its own cases, to a scope'],
  [
    databasePackage.divisionsStore,
    'binds the division queries, each with its own cases, to a scope',
  ],
  [databasePackage.gamesStore, 'binds the game queries (own cases) to a scope'],
  [
    databasePackage.scoringSessionsStore,
    'binds the scoring session queries (own cases) to a scope',
  ],
  [databasePackage.liveGamesStore, 'binds the live game queries (own cases) to a scope'],
  [scoringSessionSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [databasePackage.standingsStore, 'binds the standings queries (own cases) to a scope'],
  [
    databasePackage.lockSeasonStandings,
    "takes a lock keyed by the scope's own league and a season id; reads and writes no rows",
  ],
  [databasePackage.peopleStore, 'binds the people queries (own cases) to a scope'],
  [databasePackage.importsStore, 'binds the import queries (own cases) to a scope'],
  [databasePackage.schedulingStore, 'binds the venue and court queries (own cases) to a scope'],
  [currentLeague, 'turns a row already read into the returned shape; runs no SQL'],
  [leagueStatusOf, "checks a state already read against core's list; runs no SQL"],
  [constraintOf, 'reads the code and constraint name off an error already thrown; runs no SQL'],
  [databasePackage.withTransaction, 'opens the fenced transaction every case runs in'],
  // It opens its own transaction, which no case can do inside a harness run; its
  // mapping of a context to the fences is tested beside it.
  [databasePackage.commandTransaction, "opens a command's fenced transaction (withTransaction)"],
  [databasePackage.leaguesStore, 'binds the leagues queries, each with its own cases, to a scope'],
  [databasePackage.accessStore, 'binds the access queries, each with its own cases, to a scope'],
  [databasePackage.activityLogStore, 'binds the activity log queries (own cases) to a scope'],
  [grantFromRow, 'turns a row already read into the returned shape; runs no SQL'],
  [invitationFromRow, 'turns a row already read into the returned shape; runs no SQL'],
  [invitationStatus, 'builds a column expression for the queries that use it; runs no SQL'],
  [scopeColumns, 'turns a scope into its two column values; runs no SQL'],
  [databasePackage.jobsStore, 'binds insertJob, which has its own case, to a scope'],
  // The worker's one look across leagues, by design (record 012), so no league case
  // can hold it: it runs in a transaction with no league and no account set, through
  // the owner-run take_jobs, and returns ids only. Its type (NoLeagueScope) refuses
  // a league scope at compile time, and take_jobs refuses at run time any
  // transaction with a league or account set: a check in the database, not proof
  // that only the worker calls it (both apps act as app_user; a worker role of its
  // own is the later hardening). Tested in schema/jobs.test.ts and take-jobs.test.ts.
  [databasePackage.takeJobs, 'the worker taking due jobs of every league (record 012)'],
  [databasePackage.tableQueue, 'opens its own transactions: takeJobs, then settleJob per job'],
  [databasePackage.pgBossQueue, 'opens its own transactions: takeJobs, then settleJob per job'],
  [databasePackage.createPgBoss, "makes pg-boss for its own schema; reads no league's rows"],
  [databasePackage.createDatabase, 'opens connections; reads no rows'],
  [databasePackage.checkLoginRole, "reads the login role's facts from pg_roles only"],
  [databasePackage.applyMigrations, 'the migration runner (T-48): schema, as the owner'],
  [databasePackage.runMigrations, 'the migration runner (T-48): schema, as the owner'],
  [databasePackage.loadMigrations, 'reads migration files from disk'],
  [databasePackage.migrationChecksum, 'hashes migration text'],
  [databasePackage.normalizeMigrationText, 'normalises migration text'],
  [databasePackage.pgliteDriver, "the migration runner's PGlite connection"],
  [databasePackage.connectPostgresDriver, "the migration runner's PostgreSQL connection"],
  [
    databasePackage.readTrackerBackup,
    'reads a copy of a tracker backup folder on disk with its own embedded database; no league, no platform tables (step 2.57)',
  ],
  [databasePackage.TrackerBackupError, 'the reader error class; runs nothing'],
]);

/**
 * T-221: lookups that must answer before any league is set, so they cannot be fenced
 * to one league and no two-league case can hold them. Each goes through one narrow
 * database function that runs as the tables' owner, answers one question for one
 * value at a time and returns the fewest columns; the function itself is reviewed and
 * listed in schema/app-role.test.ts. Adding to this list is a review too.
 */
const narrowLookups = new Map<unknown, string>([
  [
    databasePackage.findLeagueByShortName,
    'the league one short name in an address names (find_league_by_slug): id, short name, state',
  ],
]);

/** The exported functions that are commands (made by defineCommand). */
const commandsIn = (found: readonly ExportedFunction[]) =>
  found.filter((f) => typeof (f.value as { commandName?: unknown }).commandName === 'string');

type FoundHandler = { where: string; handler: { type: string; handle: unknown } };

/** Exported objects shaped like an event handler (onEvent): a type and a handle. */
const foundHandlers = (scan: ScannedModules): FoundHandler[] =>
  [...scan].flatMap(([file, exports]) =>
    Object.entries(exports).flatMap(([name, value]) => {
      const handler = value as { type?: unknown; handle?: unknown } | null;
      return typeof handler?.type === 'string' && typeof handler.handle === 'function'
        ? [{ where: `${file}: ${name}`, handler: { type: handler.type, handle: handler.handle } }]
        : [];
    }),
  );
const handlersIn = (scan: ScannedModules) => foundHandlers(scan).map((f) => f.where);

/** Handlers found with no case of their own, or missing from core's eventHandlers. */
const handlersUncovered = (found: readonly FoundHandler[]) => {
  const listed = new Set<unknown>(eventHandlers.map((h) => h.handle));
  const cased = subjects();
  return found
    .filter(({ handler }) => !listed.has(handler.handle) || !cased.has(handler.handle))
    .map((f) => f.where);
};

let modules: ScannedModules;
let functions: ExportedFunction[];
let coreModules: ScannedModules;
let coreCommands: ExportedFunction[];
beforeAll(async () => {
  modules = await scanModules(root, scanned);
  functions = exportedFunctions(modules);
  coreModules = await scanModules(root, coreScanned);
  coreCommands = commandsIn(exportedFunctions(coreModules));
});
const subjects = () => new Set<unknown>(registeredIsolationCases().map((c) => c.subject));
const covered = () =>
  new Set([...subjects(), ...reachNoLeagueData.keys(), ...narrowLookups.keys()]);

const registered = () => new Set<unknown>(commands.values());
const commandFile = '../core/src/modules/leagues/commands/set-league-name.ts';

describe('every query and command is in the two-league harness (T-65)', () => {
  it('finds the package index and every query and command file, and no tests', () => {
    const files = [...modules.keys()];
    expect(files).toEqual(expect.arrayContaining(['index.ts', 'src/queries/list-programs.ts']));
    const all = [...files, ...coreModules.keys()];
    expect(all.some((file) => /\.test(-helper)?\.ts$/.test(file))).toBe(false);
    expect(functions.map((f) => f.where)).toContain('index.ts: listPrograms');
    expect(coreCommands.map((f) => f.where)).toContain(`${commandFile}: setLeagueName`);
  });

  it('every exported function has an isolation case or a reviewed reason', () => {
    expect(uncoveredFunctions(functions, covered())).toEqual([]);
  });

  it("every command exported anywhere in core has a case and is in core's registry", () => {
    expect(uncoveredFunctions(coreCommands, subjects())).toEqual([]);
    expect(uncoveredFunctions(coreCommands, registered())).toEqual([]);
    const found = new Set(coreCommands.map((f) => f.value));
    expect([...commands.values()].filter((c) => !found.has(c))).toEqual([]);
  });

  it("every event handler in core is in core's eventHandlers, which the command cases run, and has a case", () => {
    const found = foundHandlers(coreModules);
    expect(found.map((f) => f.where)).toEqual(
      expect.arrayContaining([
        '../core/src/modules/standings/on-game-result.ts: rebuildOnGameFinalized',
      ]),
    );
    expect(handlersUncovered(found)).toEqual([]);
    // And the other way: every handler the apps run is one the scan finds.
    const handles = new Set(found.map((f) => f.handler.handle));
    expect(eventHandlers.filter((h) => !handles.has(h.handle)).map((h) => h.type)).toEqual([]);
  });

  it('reports a planted handler with no case and not in eventHandlers', () => {
    const planted: ScannedModules = new Map([
      ['../core/src/x.ts', { onRename: { type: 'leagues.name_changed', handle: () => {} } }],
    ]);
    expect(handlersUncovered(foundHandlers(planted))).toEqual(['../core/src/x.ts: onRename']);
  });

  it('names no case or reason for a function the scan does not find', () => {
    const found = new Set<unknown>([
      ...[...functions, ...coreCommands].map((f) => f.value),
      ...foundHandlers(coreModules).map((f) => f.handler.handle),
    ]);
    const stale = [...subjects(), ...reachNoLeagueData.keys(), ...narrowLookups.keys()].filter(
      (f) => !found.has(f),
    );
    expect(stale).toEqual([]);
  });

  it('reports a planted query with no case, by file and name, inside objects too', () => {
    const listEverything = () => [];
    const planted: ScannedModules = new Map<string, Record<string, unknown>>([
      ['src/queries/list-programs.ts', { listPrograms: databasePackage.listPrograms }],
      ['src/queries/deep/list-everything.ts', { listEverything, everythingColumns: ['id'] }],
      ['src/queries/grouped.ts', { programQueries: { all: listEverything, count: 3 } }],
      // The same name as a covered query, but another function.
      ['src/queries/impostor.ts', { listPrograms: () => [] }],
    ]);
    expect(uncoveredFunctions(exportedFunctions(planted), covered())).toEqual([
      'src/queries/deep/list-everything.ts: listEverything',
      'src/queries/grouped.ts: programQueries.all',
      'src/queries/impostor.ts: listPrograms',
    ]);
  });

  it('reports a planted command anywhere in core with no case and not in the registry', () => {
    const plantedCommand = Object.assign(() => undefined, { commandName: 'leagues.planted' });
    const helper = () => undefined;
    const planted: ScannedModules = new Map([
      ['../core/src/somewhere/planted.ts', { plantedCommand, helper }],
    ]);
    const found = commandsIn(exportedFunctions(planted));
    const where = ['../core/src/somewhere/planted.ts: plantedCommand'];
    expect(uncoveredFunctions(found, subjects())).toEqual(where);
    expect(uncoveredFunctions(found, registered())).toEqual(where);
  });

  it('reports a planted event handler', () => {
    const planted: ScannedModules = new Map([
      ['../core/src/x.ts', { onRename: { type: 'leagues.name_changed', handle: () => {} } }],
    ]);
    expect(handlersIn(planted)).toEqual(['../core/src/x.ts: onRename']);
  });
});
