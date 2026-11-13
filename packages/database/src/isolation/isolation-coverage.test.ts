// Automatic pickup (T-65): a new query or command cannot skip the two-league
// harness. Every function the package exports (index.ts), and every function
// exported anywhere under the scanned folders (this package's queries and stores),
// has a registered case or is listed below with the reason it reaches no league
// data. Adding to that list is a review. Every command exported anywhere in core
// (a function carrying `commandName`) must have a case and be in core's registry,
// which the apps use.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from '@srleagues/core';
import { beforeAll, describe, expect, it } from 'vitest';
import * as databasePackage from '../../index.ts';
import { programSummary } from '../queries/program-summary.ts';
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
  [databasePackage.withTransaction, 'opens the fenced transaction every case runs in'],
  // It opens its own transaction, which no case can do inside a harness run; its
  // mapping of a context to the fences is tested beside it.
  [databasePackage.commandTransaction, "opens a command's fenced transaction (withTransaction)"],
  [databasePackage.leaguesStore, 'binds the leagues queries, each with its own cases, to a scope'],
  [databasePackage.createDatabase, 'opens connections; reads no rows'],
  [databasePackage.checkLoginRole, "reads the login role's facts from pg_roles only"],
  [databasePackage.applyMigrations, 'the migration runner (T-48): schema, as the owner'],
  [databasePackage.runMigrations, 'the migration runner (T-48): schema, as the owner'],
  [databasePackage.loadMigrations, 'reads migration files from disk'],
  [databasePackage.migrationChecksum, 'hashes migration text'],
  [databasePackage.normalizeMigrationText, 'normalises migration text'],
  [databasePackage.pgliteDriver, "the migration runner's PGlite connection"],
  [databasePackage.connectPostgresDriver, "the migration runner's PostgreSQL connection"],
]);

/** The exported functions that are commands (made by defineCommand). */
const commandsIn = (found: readonly ExportedFunction[]) =>
  found.filter((f) => typeof (f.value as { commandName?: unknown }).commandName === 'string');

/** Exported objects shaped like an event handler (onEvent): a type and a handle. */
const handlersIn = (scan: ScannedModules) =>
  [...scan].flatMap(([file, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => {
        const handler = value as { type?: unknown; handle?: unknown } | null;
        return typeof handler?.type === 'string' && typeof handler.handle === 'function';
      })
      .map(([name]) => `${file}: ${name}`),
  );

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
const covered = () => new Set([...subjects(), ...reachNoLeagueData.keys()]);

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

  it('finds no event handler in core yet, since the harness runs none', () => {
    // When the first handler lands, pass the app's handler list to the command cases
    // (registerCommandCase's `events`), then replace this check with one that every
    // handler found is in that list.
    expect(handlersIn(coreModules)).toEqual([]);
  });

  it('names no case or reason for a function the scan does not find', () => {
    const found = new Set([...functions, ...coreCommands].map((f) => f.value));
    const stale = [...subjects(), ...reachNoLeagueData.keys()].filter((f) => !found.has(f));
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
