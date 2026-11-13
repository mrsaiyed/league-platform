// Automatic pickup (T-65): a new query cannot skip the two-league harness. Every
// function the package exports (index.ts), and every function exported anywhere
// under the scanned folders, has a registered case or is listed below with the
// reason it reaches no league data. Adding to that list is a review.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** Paths from packages/database. Step 1.10 adds its command folders. */
const scanned = ['index.ts', 'src/queries'];

/** Exported functions that read or write no league data, and why. */
const reachNoLeagueData = new Map<unknown, string>([
  [programSummary, 'turns a row already read into the returned shape; runs no SQL'],
  [databasePackage.withTransaction, 'opens the fenced transaction every case runs in'],
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let modules: ScannedModules;
let functions: ExportedFunction[];
beforeAll(async () => {
  modules = await scanModules(root, scanned);
  functions = exportedFunctions(modules);
});
const subjects = () => new Set<unknown>(registeredIsolationCases().map((c) => c.subject));
const covered = () => new Set([...subjects(), ...reachNoLeagueData.keys()]);

describe('every query is in the two-league harness (T-65)', () => {
  it('finds the package index and every query file, and no tests', () => {
    const files = [...modules.keys()];
    expect(files).toEqual(expect.arrayContaining(['index.ts', 'src/queries/list-programs.ts']));
    expect(files.some((file) => /\.test(-helper)?\.ts$/.test(file))).toBe(false);
    expect(functions.map((f) => f.where)).toContain('index.ts: listPrograms');
  });

  it('every exported function has an isolation case or a reviewed reason', () => {
    expect(uncoveredFunctions(functions, covered())).toEqual([]);
  });

  it('names no case or reason for a function the scan does not find', () => {
    const found = new Set(functions.map((f) => f.value));
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
});
