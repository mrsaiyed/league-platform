// `npm run transfer:tracker`: brings the games the old live tracker recorded into one
// league and season of a local test database (step 2.58, F-7). A thin script: it reads
// its options, and packages/database does the work (transferTrackerGamesInFolder), with
// the plan and the comparing in packages/core. Without --run it only shows the plan.
//
// Made-up data only (T-201): it opens a database folder on this computer, never an
// address, and refuses anything that reads as one. The backup is read from a copy.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describeTransferPlan, describeTransferReport } from '@srleagues/core';
import { TrackerBackupError, transferTrackerGamesInFolder } from '@srleagues/database';
import * as words from './transfer-tracker-games.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let values;
try {
  ({ values } = parseArgs({
    options: {
      backup: { type: 'string' },
      league: { type: 'string' },
      season: { type: 'string' },
      as: { type: 'string' },
      db: { type: 'string' },
      work: { type: 'string' },
      'with-opponents': { type: 'boolean', default: false },
      run: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(words.usage);
  process.exit(2);
}
if (values.help) {
  console.log(words.usage);
  process.exit(0);
}
for (const name of ['backup', 'league', 'season', 'as']) {
  if (values[name] === undefined) {
    console.error(words.missingOption(name));
    console.error(words.usage);
    process.exit(2);
  }
}

const databaseFolder = values.db ?? path.join(root, '.local', 'seed-db');
let outcome;
try {
  outcome = await transferTrackerGamesInFolder(databaseFolder, {
    backupFolder: values.backup,
    workDir: path.resolve(values.work ?? path.join(root, '.local', 'transfer-work')),
    league: values.league,
    season: values.season,
    actorEmail: values.as,
    dryRun: !values.run,
    withOpponents: values['with-opponents'],
  });
} catch (error) {
  if (error instanceof TrackerBackupError) {
    console.error(words.backupProblems[error.problem] ?? error.message);
    process.exit(1);
  }
  throw error;
}
if (!outcome.ok) {
  console.error(words.setupProblems[outcome.problem.kind]);
  process.exit(1);
}

const said = {
  data: outcome.backup,
  timeZone: outcome.timeZone,
  withOpponents: values['with-opponents'],
};
for (const line of describeTransferPlan(said, outcome.plan)) console.log(line);
if (outcome.report === null) {
  console.log(words.dryRunDone);
} else {
  console.log('');
  for (const line of describeTransferReport(said, outcome.report)) console.log(line);
}
console.log(words.databaseLine(path.resolve(databaseFolder)));
// Not done unless nothing was blocked, the run went through, and every one of the tracked
// team's players was brought over (the plan and the report warn about any left out).
const complete =
  outcome.report?.stopped == null && outcome.plan.ready && outcome.plan.notBroughtOver.length === 0;
process.exit(complete ? 0 : 1);
