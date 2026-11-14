// The words of scripts/transfer-tracker-games.mjs that are not the plan's or the report's
// (those are packages/core's tracker-transfer-words.ts): how to use it, and why it could
// not start (T-187).

export const usage = [
  'Brings the games the old tracker recorded into one league and season of a local test',
  'database, through the product’s own commands (step 2.58). Shows the plan and changes',
  'nothing unless --run is given.',
  '',
  'npm run transfer:tracker -- --backup <folder> --league <short name> --season <season> --as <email>',
  '  --backup <folder>  the folder `npm run stats:copy -- --to <folder>` wrote',
  '  --league <name>    the league’s short name',
  '  --season <season>  the season’s short name or its name',
  '  --as <email>       the league admin the transfer acts as',
  '  --db <folder>      the local database folder (default .local/seed-db)',
  '  --work <folder>    where the backup is copied while it is read (default .local/transfer-work)',
  '  --with-opponents   also add the other teams’ players the games name',
  '  --run              carry the plan out (without it, nothing is changed)',
].join('\n');

export const missingOption = (name) => `Missing --${name}.`;
export const unknownOption = (name) => `Unknown option ${name}.`;

export const setupProblems = {
  'address-not-allowed':
    'The database must be a folder on this computer, not an address. The transfer never connects to a hosted database.',
  'no-database': 'There is no database in that folder. Make one with `npm run seed`.',
  'league-not-found': 'There is no league with that short name in this database.',
  'season-not-found': 'The league has no season with that short name or name.',
  'several-seasons': 'More than one season has that name. Give its short name instead.',
  'account-not-found': 'There is no account with that email in this database.',
};

export const backupProblems = {
  missing: 'There is no backup folder there.',
  unreadable: 'The backup folder could not be copied: a file in it cannot be read.',
  'not-a-database': 'That folder holds no tracker database, or one that will not open.',
  'not-a-tracker-backup': 'That database is not a backup of the tracker: its tables are missing.',
  'in-use': 'A running stats server has the backup open. Stop it first.',
  'work-dir-unusable': 'The working folder cannot be used. Pick another with --work.',
};

export const dryRunDone = 'Dry run: nothing was changed. Run again with --run to carry it out.';
export const databaseLine = (folder) => `Test database: ${folder}`;
