// The words of scripts/make-league.mjs (step 2.125 part 1): how to use it, its
// questions, the plan it shows before making anything, and what came of it (T-187).

export const usage = [
  'Makes a league in draft, with its first season as the current one, in one step,',
  'through the product’s own commands (step 2.125). It shows what it will make and asks',
  'first. Anything not given is asked for.',
  '',
  'npm run league:make -- --name <name> --short-name <name> --city <city> \\',
  '  --contact-email <email> --owner-email <email> --as <email>',
  '  --name <name>            the league’s name, such as "Lakeside Hoops League"',
  '  --short-name <name>      its address: 3 to 40 lowercase letters, numbers and hyphens',
  '  --sport <sport>          basketball (the only sport for now)',
  '  --who-plays <who>        adults, under-18s or both (asked when not given: answer it',
  '                           with care, nothing can change it afterwards yet)',
  '  --listed <yes|no>        whether the league finder lists it (default: yes for adults,',
  '                           no when under-18s play)',
  '  --city <city>            where it plays',
  '  --time-zone <zone>       a named zone such as America/Chicago (default: this computer’s);',
  '                           not an offset such as +05:00 nor an abbreviation such as EST',
  '  --contact-email <email>  how people reach the league',
  '  --owner-email <email>    the owner’s email; they need no account yet',
  '  --season <name>          the first season’s name (default: from today in the league’s',
  '                           time zone, such as "Fall 2026" or "Winter 2026–2027")',
  '  --season-starts <date>   when it starts, YYYY-MM-DD (optional)',
  '  --season-ends <date>     when it ends, YYYY-MM-DD (optional)',
  '  --as <email>             your own email, as SR Leagues staff',
  '  --db <folder>            a local test database folder (default: .local/seed-db)',
  '  --hosted                 a hosted database instead: see below',
  '',
  'Where it makes the league: on this computer unless told otherwise, in --db or the',
  'local test database in .local/seed-db, even when hosted settings are in .env.',
  '',
  'With --hosted, at a terminal only, on the database the two logins reach, given for',
  'this one command and never kept in .env (docs/operations/make-a-league.md):',
  '  MIGRATION_DATABASE_URL   the migration login: the account rows and the checks only',
  '  PLATFORM_DATABASE_URL    the app’s own restricted login, which runs every command',
  '  MIGRATION_DATABASE_SSL   verify (default), no-verify or off; for a database not on',
  '                           this computer only verify, with',
  '  MIGRATION_DATABASE_CA    the server’s certificate file (for Supabase, theirs)',
  'The question is then answered by typing the league’s short name.',
].join('\n');

export const questions = {
  name: 'League name',
  shortName: 'Short name (its address)',
  sport: 'Sport',
  whoPlays: 'Who plays? (adults, under-18s or both)',
  city: 'City',
  timeZone: 'Time zone (a named zone, such as America/Chicago)',
  contactEmail: 'Contact email',
  ownerEmail: 'Owner’s email',
  seasonName: 'First season’s name',
  seasonStartsOn: 'First season starts (YYYY-MM-DD, or Enter to leave it out)',
  seasonEndsOn: 'First season ends (YYYY-MM-DD, or Enter to leave it out)',
  staffEmail: 'Your own email (SR Leagues staff)',
};

/** The words of the fields that are never asked, for their problems. */
const otherFields = { listed: 'Listed (--listed)' };

/** "Fall 2026" or "Winter 2026–2027" (P3 §1 step 4). */
export const seasonPartNames = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};
export const seasonName = (suggestion) =>
  `${seasonPartNames[suggestion.part]} ${suggestion.years.join('–')}`;

export const withDefault = (question, value) => `${question} [${value}]: `;
export const plainQuestion = (question) => `${question}: `;

export const problemWords = {
  missing: (field) => `${questions[field] ?? otherFields[field]}: missing.`,
  invalid: {
    name: 'League name: 1 to 120 characters.',
    shortName: 'Short name: 3 to 40 lowercase letters, numbers and hyphens.',
    sport: 'Sport: only basketball for now.',
    whoPlays: 'Who plays: adults, under-18s or both.',
    listed: 'Listed: yes or no.',
    city: 'City: 1 to 100 characters.',
    timeZone:
      'Time zone: give a named zone this computer knows, such as America/Chicago. An offset such as +05:00 or an abbreviation such as EST is not taken.',
    contactEmail: 'Contact email: not an email address.',
    ownerEmail: 'Owner’s email: not an email address (an address on .invalid cannot sign in).',
    seasonName: 'First season’s name: 1 to 120 characters.',
    seasonStartsOn: 'First season starts: a real date written YYYY-MM-DD, such as 2026-09-01.',
    seasonEndsOn: 'First season ends: a real date written YYYY-MM-DD, such as 2027-02-28.',
    staffEmail: 'Your own email: not an email address (an address on .invalid cannot sign in).',
  },
  blocked: {
    shortName: 'Short name: that word is not allowed (one of ours, or offensive). Choose another.',
  },
  'before-start': {
    seasonEndsOn: 'First season ends: before it starts.',
  },
};

export const whoPlaysWords = { adult: 'adults', youth: 'under-18s', mixed: 'adults and under-18s' };

/** What follows from "who plays" (R-14, U-10), in plain words. */
const whoPlaysMeans = {
  adult:
    'Players are shown on public pages by their full names (anyone known to be under 18 is still shown by first name and last initial).',
  youth:
    'Players are shown on public pages by first name and last initial until the league’s admin changes that.',
  mixed:
    'Players not known to be adults are shown on public pages by first name and last initial until the league’s admin changes that.',
};
const whoPlaysFixed = 'Check it now: there is no screen to change “who plays” afterwards yet.';

const listedWords = (plan) => {
  const answer = plan.listed ? 'yes' : 'no';
  if (plan.listedChosen) return `${answer} (chosen with --listed)`;
  return plan.audience === 'adult'
    ? 'yes: an adult league is listed unless told otherwise (--listed no)'
    : 'no: a league with under-18s is listed only if it chooses to be (--listed yes)';
};

const seasonDates = (season) => {
  if (season.startsOn === null && season.endsOn === null) return 'no dates yet';
  if (season.endsOn === null) return `from ${season.startsOn}`;
  if (season.startsOn === null) return `until ${season.endsOn}`;
  return `from ${season.startsOn} to ${season.endsOn}`;
};

const accountWords = {
  owner: {
    none: '(no account yet: one is made for this address, and it becomes theirs when they first sign in with it)',
    'never-signed-in':
      '(an account was made for this address earlier; nobody has signed in with it yet)',
    'signed-up': '(has signed up)',
  },
  staff: {
    none: '(an account is made for this address)',
    'never-signed-in':
      '(an account was made for this address earlier; nobody has signed in with it yet)',
    'signed-up': '(has signed up)',
  },
};

/**
 * Where, from what was really connected to: the connection's host and port, the
 * server's own database name, the Supabase project when there is one (it is public),
 * and whether it is this computer. Never a user name or a password.
 */
export const placeWords = (place) => {
  // A folder may be on a network share: it is named, not said to be on this computer.
  if (place.kind === 'folder') return `a folder: ${place.folder}`;
  if (place.kind === 'memory') return 'a database in memory, in this program';
  const project = place.project === null ? '' : `, Supabase project ${place.project}`;
  const where = place.onThisComputer
    ? 'on this computer (localhost)'
    : 'NOT on this computer: a hosted database';
  return `the database ${place.database} on ${place.host}:${place.port}${project}, ${where}; the commands run under the app’s own login, which reaches the same database`;
};

const indent = '                  ';

export const planLines = (plan, preview, place, address) => [
  '',
  'This will make, in one step:',
  `  League          ${plan.name}`,
  `  Address         ${address}`,
  `  Sport           ${plan.sportKey}`,
  `  Who plays       ${whoPlaysWords[plan.audience]}`,
  `${indent}${whoPlaysMeans[plan.audience]}`,
  `${indent}${whoPlaysFixed}`,
  `  Listed          ${listedWords(plan)}, in the league finder (/find)`,
  `  City            ${plan.city}`,
  `  Time zone       ${plan.timeZone}`,
  `  Contact email   ${plan.contactEmail}`,
  `  Owner           ${plan.ownerEmail} ${accountWords.owner[preview.owner]}`,
  `  First season    ${plan.season.name}, the current one, ${seasonDates(plan.season)}`,
  '  State           draft: only the league’s own staff can see it until it is published',
  `  Made by         ${plan.staffEmail} ${accountWords.staff[preview.staff]}`,
  `  Where           ${placeWords(place)}`,
  '',
];

export const confirm = 'Make it? Type yes to go ahead: ';
/** On a hosted database the question is answered by typing the league's short name. */
export const confirmHosted =
  'This is a hosted database. To make it there, type the league’s short name: ';

/** Shown right above the hosted question: what to check before answering it. */
export const checkBeforeAnswering = (place) =>
  place.kind === 'postgres' && place.project !== null
    ? [
        `Supabase project: ${place.project}`,
        'Check that reference against the test copy’s project in the Supabase dashboard, and that it is not the one in supabase/site.json, before you answer.',
      ]
    : [
        `Database: ${placeWords(place)}`,
        'Check that this is the database you mean before you answer.',
      ];
export const notMade = 'Nothing was made.';
export const stopped = 'Stopped. Nothing was made.';
export const needsTerminal =
  'It asks before making anything, and this is not a terminal that can ask: run it in a terminal.';
export const notInteractive =
  'Some answers are missing and this is not a terminal that can ask. Give them as options.';

// Before anything connects (make-league-source.mjs).
export const hostedSettingsIgnored = (names) =>
  `Note: ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} set, and not used: this run is on this computer. A hosted database needs --hosted.`;
export const hostedAndFolder = '--hosted and --db cannot be given together: choose one.';
export const queryStringRefused = (name) =>
  `${name}: invalid, a hosted address must have nothing after "?": take the query string off. Nothing was opened.`;
export const hostedNeedsTerminal =
  '--hosted is used only at a terminal, where a person reads the plan and answers. Nothing was opened.';
export const addressesInEnvFile = (names) =>
  `.env names ${names.join(' and ')}. For a hosted database, give the addresses for this one command only, never in .env: take them out of .env first. Nothing was opened.`;
export const settingMissing = (name) =>
  `${name}: missing. --hosted needs both logins: MIGRATION_DATABASE_URL (the migration login) and PLATFORM_DATABASE_URL (the app’s own login).`;
export const notPostgres = (name) => `${name}: invalid, must be a postgres:// address.`;
export const certificateNotChecked = (name) =>
  `${name}: that database is not on this computer, so its certificate must be checked: set MIGRATION_DATABASE_SSL=verify (or leave it out) and MIGRATION_DATABASE_CA to the server’s certificate file (for Supabase, the one in the project’s database settings). Nothing was opened.`;

export const caUnreadable = 'The file named by MIGRATION_DATABASE_CA cannot be read.';
export const badSsl = 'MIGRATION_DATABASE_SSL must be verify, no-verify or off.';

const loginWords = {
  migration: 'the migration login (MIGRATION_DATABASE_URL)',
  app: 'the app’s own login (PLATFORM_DATABASE_URL)',
};

/** What to look at when a connection fails: its likely cause first, then the usual ones. */
const causeWords = {
  login: 'the database refused the user name or password',
  database: 'the database named in the address does not exist there',
  host: 'the host name could not be found',
  network: 'nothing answered at that host and port (the address, the port, or a firewall)',
  certificate:
    'the server’s certificate could not be checked (the file in MIGRATION_DATABASE_CA, or the host name)',
  ssl: 'the connection’s SSL setting (MIGRATION_DATABASE_SSL) does not suit that server',
  timeout: 'nothing answered within 15 seconds (the host, the port, or a firewall)',
  unknown: 'no particular cause could be told',
};
const usualCauses =
  'The usual causes: the host or port, the user name or password, the database name, the certificate file in MIGRATION_DATABASE_CA, and a network or firewall in the way. The address is not printed.';

/** Why the target could not be opened (openLeagueMakingTarget). */
export const targetProblemLines = (problem) => {
  if (problem.kind === 'no-database') {
    return [
      'There is no database in that folder. Make the local test one with `npm run seed`. Nothing was made.',
    ];
  }
  if (problem.kind === 'certificate-not-checked') {
    return [
      certificateNotChecked(
        problem.login === 'app' ? 'PLATFORM_DATABASE_URL' : 'MIGRATION_DATABASE_URL',
      ),
    ];
  }
  if (problem.kind === 'query-string') {
    return [
      queryStringRefused(
        problem.login === 'app' ? 'PLATFORM_DATABASE_URL' : 'MIGRATION_DATABASE_URL',
      ),
    ];
  }
  if (problem.kind === 'cannot-connect') {
    return [
      `Could not connect through ${loginWords[problem.login]}: ${causeWords[problem.cause]}. Nothing was made.`,
      usualCauses,
    ];
  }
  if (problem.kind === 'tracker-database') {
    return [
      `${loginWords[problem.login]} reaches a database that holds the tracker’s own data (the live_stats schema). The platform never uses the tracker’s database. Nothing was read and nothing was made.`,
    ];
  }
  return [
    'The two logins reach different databases. Both must be logins to the same database. Nothing was made.',
  ];
};

const gapWords = {
  'sees-past-fence':
    'it cannot find accounts by email (it must be the tables’ owner login that bypasses row-level security, such as Supabase’s postgres)',
  accounts: 'it may not read, add and remove rows in the accounts table',
  'migration-log': 'it may not read the migration log',
  functions: 'it may not call find_league_by_slug and uuid_v7',
};

/** Why a login may not do its part (probe-logins.ts), with what to do. */
const loginProblemLines = (problems) =>
  problems.map((found) =>
    found.login === 'app'
      ? `${loginWords.app} may not run the commands: ${found.problems.join('; ')}. Use the login the web app uses: a member of app_user, not a superuser, not the tables’ owner.`
      : `${loginWords.migration} may not do its part: ${found.gaps.map((gap) => gapWords[gap]).join('; ')}. Use the migration login that applied the migrations.`,
  );

/** Why nothing can be made there: a login, or the migrations (the preview's and makeLeague's). */
export const readinessLines = (problem) =>
  problem.kind === 'login'
    ? [...loginProblemLines(problem.problems), notMade]
    : [migrationProblems[problem.state]];

/** A database not at this code's migrations (migration-state.ts). */
export const migrationProblems = {
  none: 'That database has no migrations applied. Apply the migrations first (docs/operations/apply-migrations.md). Nothing was made.',
  behind:
    'That database is behind this code: some of its migrations are not applied. Apply the migrations first (docs/operations/apply-migrations.md). Nothing was made.',
  ahead:
    'That database has migrations newer than this code: it was set up by a later version. Bring this copy of the code up to date first. Nothing was made.',
  different:
    'A migration applied to that database differs from this code’s file of the same number: they come from different versions. Nothing was made.',
  'code-unreadable':
    'This copy’s migrations folder cannot be read, or its files are not numbered in order, so the database cannot be checked against it. Nothing was made.',
};

export const shortNameHeld =
  'Another league has that short name, or its old address still forwards there. Choose another. Nothing was made.';

const withCode = (code) => (code === undefined ? '' : ` (${code})`);

/** The accounts a run made when surely no league was made: removed again, or left. */
const leftAccountLines = (accounts) => [
  ...accounts.removed.map(
    (account) => `The account this run made for ${account.email} was removed again.`,
  ),
  ...accounts.left.map((account) =>
    account.accountId === null
      ? `An account may have been made for ${account.email}, and it could not be looked up again. Do not remove anything: run this again with the same answers and it will say what exists.`
      : `An account was made for ${account.email} (account id ${account.accountId}) and is still there. Nobody has signed in with it and no league uses it, so it does no harm, and a later run with the same email uses it. To remove it, the migration login can delete that one row from the accounts table.`,
  ),
];

/** The accounts a run made when it is not known whether a league was made. */
const unknownAccountLines = (accounts) =>
  accounts.left.length === 0
    ? []
    : [
        `The accounts this run made are still there: ${accounts.left.map((a) => a.email).join(', ')}. Whether a league uses them is not known: if the league was made, one of them is its owner. Do not remove anything.`,
      ];

/** What a run that made no league says (makeLeague's problem). */
export const makeProblemLines = (problem, accounts) => {
  if (problem.kind === 'migrations' || problem.kind === 'login') return readinessLines(problem);
  if (problem.kind === 'short-name-held') return [shortNameHeld];
  if (problem.kind === 'refused') {
    return [
      `Refused while making the league${withCode(problem.code)}. No league and no season were made.`,
      ...leftAccountLines(accounts),
    ];
  }
  if (problem.league === 'made') {
    return [
      `Something went wrong${withCode(problem.reason)} after the league was made. It is there, in draft, with its first season as the current one (league id ${problem.leagueId}). Check it before running this again.`,
    ];
  }
  if (problem.league === 'unknown') {
    return [
      `Something went wrong${withCode(problem.reason)}, and whether the league was made is not known: it could not be checked.`,
      ...unknownAccountLines(accounts),
      'Run this again with the same answers: it will say what exists (whether the short name is now held, and the accounts).',
    ];
  }
  return [
    `Something went wrong${withCode(problem.reason)}. No league and no season were made.`,
    ...leftAccountLines(accounts),
  ];
};

/** Anything the script did not expect, before it began making anything. */
export const unexpected = (code) =>
  `Something went wrong${withCode(code)} before anything was made. Nothing was made.`;
/** Anything the script did not expect once it had begun making. */
export const unexpectedWhileMaking = (code) =>
  `Something went wrong${withCode(code)} while making the league, and it is not known what was made. Run this again with the same answers: it will say if the short name is now held.`;

const ownerMadeWords = {
  none: (email) =>
    `The owner, ${email}, owns it once they first sign in with that email (signing in proves they hold that mailbox).`,
  'never-signed-in': (email) =>
    `An account was made for ${email} earlier; nobody has signed in with it yet. Whoever first signs in with that email owns the league.`,
  'signed-up': (email) => `The owner, ${email}, has signed up and owns it now.`,
};

/** What the database holds now, read back after making it, so nobody has to query it. */
const readBackLines = (facts, plan) => {
  if (facts === undefined) {
    return [
      'It could not be read back: look in the database for one league in draft and its one current season.',
    ];
  }
  const yesNo = (ok) => (ok ? 'as it should be' : 'NOT as it should be: look into it');
  const season = facts.seasons[0];
  const logWho = facts.log
    .map((e) => `${e.action} by ${e.actorEmail ?? 'nobody named'}`)
    .join('; ');
  const logRight =
    facts.log.length === 2 &&
    facts.log.every((e) => (e.actorEmail ?? '').toLowerCase() === plan.staffEmail.toLowerCase());
  return [
    'Read back from the database:',
    `  League          ${facts.league === undefined ? 'not found' : `${facts.league.slug}, ${facts.league.status}`} (${yesNo(facts.league?.status === 'draft')})`,
    `  Season          ${season === undefined ? 'none' : `${season.name}, ${season.status}, ${season.isCurrent ? 'the current one' : 'not current'}`}${facts.seasons.length > 1 ? `, and ${facts.seasons.length - 1} more` : ''} (${yesNo(facts.seasons.length === 1 && season?.isCurrent === true)})`,
    `  Activity log    ${logWho} (${yesNo(logRight)})`,
    `  Owner’s account ${facts.owner === undefined ? 'not found' : `${facts.owner.email}, ${facts.owner.signedUp ? 'someone has signed in with it' : 'no sign-in link yet'}`} (${yesNo(facts.owner !== undefined)})`,
    `  Our staff       ${facts.staffGrants} role grants in the league (${yesNo(facts.staffGrants === 0)})`,
  ];
};

export const made = (outcome, plan, address) => [
  `Made: ${plan.name}, at ${address}, in draft, with ${plan.season.name} as its current season.`,
  ownerMadeWords[outcome.owner](plan.ownerEmail),
  `League id: ${outcome.leagueId}`,
  ...readBackLines(outcome.readBack, plan),
  'Nothing was sent to anyone: tell the owner yourself to sign up with exactly that email address. Nothing can publish the league yet (part 2 of step 2.125).',
];
