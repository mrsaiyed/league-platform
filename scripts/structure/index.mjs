// The structure checks from T2 §2 and §6 and T9 §3. `npm run check` runs them on
// this repository; tests run them on planted fixtures. Run alone with
// `node scripts/structure/index.mjs [root]`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepo } from './source.mjs';
import * as importDirections from './import-directions.mjs';
import * as indexOnly from './index-only.mjs';
import * as leagueNames from './league-names.mjs';
import * as sqlLocation from './sql-location.mjs';
import * as leagueAddresses from './league-addresses.mjs';
import * as browserSecrets from './browser-secrets.mjs';
import * as migrationSafety from './migration-safety.mjs';
import * as workerOnly from './worker-only.mjs';

export const checks = [
  importDirections,
  indexOnly,
  leagueNames,
  sqlLocation,
  leagueAddresses,
  browserSecrets,
  migrationSafety,
  workerOnly,
];

/** Runs every check (or those whose rule is in `only`) over the repository at `root`. */
export function checkStructure(root, { config, only } = {}) {
  const repo = loadRepo(root, config);
  const run = only ? checks.filter((c) => only.includes(c.rule)) : checks;
  const violations = run.flatMap((c) => c.check(repo));
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { violations, fileCount: repo.files.length, checks: run };
}

export const formatViolation = (v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`;

/** Prints the result; returns the exit code. */
export function report(result, log = console.log, error = console.error) {
  if (result.violations.length) {
    error(`Structure checks failed with ${result.violations.length} problem(s):`);
    for (const v of result.violations) error('  ' + formatViolation(v));
    return 1;
  }
  log(
    `Structure checks passed: ${result.checks.map((c) => `${c.rule} ${c.title}`).join('; ')} ` +
      `(${result.fileCount} files).`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(
    process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  );
  process.exitCode = report(checkStructure(root));
}
