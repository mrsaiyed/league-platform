// The words of `npm run release` (step 2.95, record 101), kept apart from its logic as
// the league-making tool's are. No line repeats any part of an address, a user name, a
// password or an error's own message.

export const usage = [
  'Applies the database changes of this checkout, then names the commit to deploy.',
  '',
  'Usage:',
  '  npm run release                       the local test database in .local/seed-db',
  '  npm run release -- --db <folder>      a PGlite folder on this computer',
  '  npm run release -- --hosted           a hosted database, at a terminal only, with',
  '    MIGRATION_DATABASE_URL  the migration login, given for this one command only',
  '                            (never in .env, never a setting on the host)',
  '    PLATFORM_DATABASE_CA    the server’s certificate: its PEM text or a file’s path',
  '                            (for Supabase, the one on the project’s database settings page)',
  '',
  'Nothing is deployed by it: when every change is applied it names the commit, and that',
  'commit is deployed by hand on the host (docs/operations/).',
].join('\n');

export const hostedSettingIgnored = (name) =>
  `${name} is set, but without --hosted it is not read: this run uses a folder on this computer.`;
export const hostedAndFolder = '--hosted and --db cannot be given together: choose one.';
export const migrationsNeedFolder =
  '--migrations is for a folder on this computer only: a hosted release applies this checkout’s supabase/migrations.';
export const hostedNeedsTerminal =
  '--hosted needs a person at a terminal: nothing was opened. Run it yourself, in a terminal window.';
export const loginInEnvFile = (name) =>
  `${name} is in the .env file: the migration login is given for this one command only, never kept in a file. Remove it from .env. Nothing was opened.`;
export const settingMissing = (name) =>
  `${name} is not set: give the migration login’s address for this one command. Nothing was opened.`;
export const notPostgres = (name) => `${name}: invalid, must be a postgres:// address.`;
export const queryStringRefused = (name) =>
  `${name}: nothing may follow "?" in the address; SSL is set by PLATFORM_DATABASE_CA. Nothing was opened.`;
export const certificateNotChecked =
  'That database is not on this computer, so its certificate must be checked: set PLATFORM_DATABASE_CA to the server’s certificate (its PEM text, or the path of a file holding it; for Supabase, the one on the project’s database settings page). Nothing was opened.';

export const commitProblems = {
  'not-a-checkout':
    'This folder is not a git checkout, so there is no commit to deploy: run it from the repository. Nothing was opened.',
  'migrations-changed':
    'supabase/migrations has changes that are not committed: a release applies exactly one commit’s changes. Commit them, or put them back, and run it again. Nothing was opened.',
};

/**
 * Why the database could not be used, in the same four sentences as the web app's and the
 * worker's start-up (step 2.203: the certificate, the login, the database not reached, or
 * an answer that refused), naming this command's settings. Told by the error's kind only.
 */
const cannotConnect = {
  certificate:
    'the database’s certificate was not accepted: set PLATFORM_DATABASE_CA to the database’s own certificate (its PEM text, or the path of a file holding it; for Supabase, the one on the project’s database settings page), then run the release again.',
  ssl: 'the database would not take an encrypted connection: check that MIGRATION_DATABASE_URL is the hosted database’s address, then run the release again.',
  login:
    'the database refused the password or login: check the migration login and its password in MIGRATION_DATABASE_URL, then run the release again.',
  database:
    'the database named at the end of MIGRATION_DATABASE_URL does not exist there: check its name in the address, then run the release again.',
  host: 'the database could not be reached: its host in MIGRATION_DATABASE_URL was not found; check the address, then run the release again.',
  network:
    'the database could not be reached: check the address and port in MIGRATION_DATABASE_URL and that the database is running, then run the release again.',
  timeout:
    'the database could not be reached: it did not answer in time; check the address and port in MIGRATION_DATABASE_URL and that the database is running, then run the release again.',
  refused:
    'the database answered but refused the start: check the login name and the database name in MIGRATION_DATABASE_URL, then run the release again.',
  unknown:
    'the database could not be reached: check MIGRATION_DATABASE_URL and that the database is running, then run the release again.',
};

export const cannotConnectSentence = (cause, code) =>
  cause === 'refused' && code !== null
    ? cannotConnect.refused.replace(': check', ` (code ${code}): check`)
    : (cannotConnect[cause] ?? cannotConnect.unknown);

export const targetProblemLines = (problem) => {
  switch (problem.kind) {
    case 'no-database':
      return [
        'There is no database in that folder: the release never makes one. Nothing was applied.',
      ];
    case 'certificate-not-checked':
      return [certificateNotChecked];
    case 'query-string':
      return [queryStringRefused('MIGRATION_DATABASE_URL')];
    case 'tracker-database':
      return [
        'That database holds the Al-Hadi tracker’s own tables (the live_stats schema): the release never touches it. Nothing was applied.',
      ];
    case 'cannot-connect':
      return [
        `Nothing was applied: ${cannotConnectSentence(problem.cause, problem.code)}`,
        'The address is not printed.',
      ];
    default:
      return ['The database could not be opened. Nothing was applied.'];
  }
};

/** Where it acts, from what was connected to: never a user name or a password. */
export const placeWords = (place) => {
  if (place.kind === 'folder') return `a folder: ${place.folder}`;
  if (place.kind === 'memory') return 'a database in memory, in this program';
  const project = place.project === null ? '' : `, Supabase project ${place.project}`;
  const where = place.onThisComputer
    ? 'on this computer (localhost)'
    : 'NOT on this computer: a hosted database';
  return `the database ${place.database} on ${place.host}:${place.port}${project}, ${where}`;
};

export const whereLines = (place, commit) => [
  '',
  `  Changes from   commit ${commit}, its supabase/migrations`,
  `  Where          ${placeWords(place)}`,
  '  As             the migration login, which owns the tables',
  '',
];

export const checkBeforeAnswering = (place) => [
  ...(place.kind === 'postgres' && place.project !== null
    ? [
        `Supabase project: ${place.project}`,
        'Check that reference against the test copy’s project in the Supabase dashboard, and that it is not the one in supabase/site.json, before you answer.',
      ]
    : ['Check that this is the database you mean before you answer.']),
];

/** On a hosted database the question is answered by typing the database's own name. */
export const confirmHosted =
  'This is a hosted database. To apply the changes there, type the database’s name shown above: ';
export const notApplied = 'Nothing was applied. Do not deploy.';
export const stopped = 'Stopped. Nothing was applied. Do not deploy.';
export const unexpected = (code) =>
  `Something unexpected went wrong${code === undefined ? '' : ` (code ${code})`}; what was applied is in the migration log. Do not deploy: run the release again to see where it stands.`;

const list = (names) => (names.length === 0 ? 'none' : names.join(', '));

export const failedLines = (error, applied) => [
  `A change could not be applied (${error.code}${error.file === undefined ? '' : `, in ${error.file}`}); that file’s transaction was undone.`,
  `Applied before it: ${list(applied)}.`,
  'Do NOT deploy: the new version needs every change. The version running now keeps working with what is applied. Fix the file in a new commit and release again.',
];

export const appliedLines = (run, commit) => [
  `Applied now: ${list(run.applied)}.`,
  `Already applied: ${run.alreadyApplied.length} file${run.alreadyApplied.length === 1 ? '' : 's'}.`,
  ...(run.newerInDatabase.length > 0
    ? [
        `The database is ahead of this commit (${list(run.newerInDatabase)}), as after going back to an earlier version (T-156): nothing to do.`,
      ]
    : []),
  '',
  `The database is ready. Deploy commit ${commit} now, by hand on the host.`,
];
