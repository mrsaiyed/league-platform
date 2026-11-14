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
  '  --db <folder>            a local test database folder instead of the migration login’s',
  '',
  'Where it makes the league: --db if given; otherwise the database of the migration',
  'login, MIGRATION_DATABASE_URL (with MIGRATION_DATABASE_SSL: verify, no-verify or off,',
  'and MIGRATION_DATABASE_CA: a certificate file), read from the environment or .env;',
  'otherwise the local test database in .local/seed-db.',
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

const placeWords = (place) =>
  place.kind === 'folder'
    ? `the local database in ${place.folder}`
    : place.kind === 'postgres'
      ? `the database ${place.database} on ${place.host} (the migration login’s)`
      : 'a database in memory';

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
export const notMade = 'Nothing was made.';
export const needsTerminal =
  'It asks before making anything, and this is not a terminal that can ask: run it in a terminal.';
export const notInteractive =
  'Some answers are missing and this is not a terminal that can ask. Give them as options.';

export const targetProblems = {
  'no-database':
    'There is no database in that folder. Make the local test one with `npm run seed`. Nothing was made.',
  'cannot-connect':
    'Could not reach the migration login’s database. Check MIGRATION_DATABASE_URL and MIGRATION_DATABASE_SSL. Nothing was made.',
};

export const caUnreadable = 'The file named by MIGRATION_DATABASE_CA cannot be read.';
export const badSsl = 'MIGRATION_DATABASE_SSL must be verify, no-verify or off.';

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

/** The accounts a run made when no league was made: removed again, or left. */
const leftAccountLines = (accounts) => [
  ...accounts.removed.map(
    (account) => `The account this run made for ${account.email} was removed again.`,
  ),
  ...accounts.left.map(
    (account) =>
      `An account was made for ${account.email} (account id ${account.accountId}) and is still there. Nobody has signed in with it and no league uses it, so it does no harm, and a later run with the same email uses it. To remove it, the migration login can delete that one row from the accounts table.`,
  ),
];

/** What a run that made no league says (makeLeague's problem). */
export const makeProblemLines = (problem, accounts) => {
  if (problem.kind === 'migrations') return [migrationProblems[problem.state]];
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
      `Something went wrong${withCode(problem.reason)}, and whether the league was made could not be checked. Run this again with the same answers: it will say if the short name is now held.`,
      ...leftAccountLines(accounts),
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

export const made = (outcome, plan, address) => [
  `Made: ${plan.name}, at ${address}, in draft, with ${plan.season.name} as its current season.`,
  ownerMadeWords[outcome.owner](plan.ownerEmail),
  `League id: ${outcome.leagueId}`,
];
