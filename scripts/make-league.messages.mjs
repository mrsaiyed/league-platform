// The words of scripts/make-league.mjs (step 2.125 part 1): how to use it, its
// questions, the plan it shows before making anything, and what came of it (T-187).

export const usage = [
  'Makes a league in draft, with its first season as the current one, through the',
  'product’s own commands (step 2.125). It shows what it will make and asks first.',
  'Anything not given is asked for.',
  '',
  'npm run league:make -- --name <name> --short-name <name> --who-plays <adults|under-18s|both> \\',
  '  --city <city> --time-zone <zone> --contact-email <email> --owner-email <email> --as <email>',
  '  --name <name>            the league’s name, such as "Lakeside Hoops League"',
  '  --short-name <name>      its address: 3 to 40 lowercase letters, numbers and hyphens',
  '  --sport <sport>          basketball (the only sport for now)',
  '  --who-plays <who>        adults, under-18s or both',
  '  --city <city>            where it plays',
  '  --time-zone <zone>       such as America/Chicago (default: this computer’s)',
  '  --contact-email <email>  how people reach the league',
  '  --owner-email <email>    the owner’s email; they need no account yet',
  '  --season <name>          the first season’s name (default: from today, such as "Fall 2026")',
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
  timeZone: 'Time zone',
  contactEmail: 'Contact email',
  ownerEmail: 'Owner’s email',
  seasonName: 'First season’s name',
  staffEmail: 'Your own email (SR Leagues staff)',
};

/** "Fall 2026" (P3 §1 step 4). */
export const seasonPartNames = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

export const withDefault = (question, value) => `${question} [${value}]: `;
export const plainQuestion = (question) => `${question}: `;

export const problemWords = {
  missing: (field) => `${questions[field]}: missing.`,
  invalid: {
    name: 'League name: 1 to 120 characters.',
    shortName: 'Short name: 3 to 40 lowercase letters, numbers and hyphens.',
    sport: 'Sport: only basketball for now.',
    whoPlays: 'Who plays: adults, under-18s or both.',
    city: 'City: 1 to 100 characters.',
    timeZone: 'Time zone: not one this computer knows, such as America/Chicago.',
    contactEmail: 'Contact email: not an email address.',
    ownerEmail: 'Owner’s email: not an email address.',
    seasonName: 'First season’s name: 1 to 120 characters.',
  },
  blocked: {
    shortName: 'Short name: that word is not allowed (one of ours, or offensive). Choose another.',
  },
};
export const missingStaff = 'Your own email: missing (--as).';
export const badStaff = 'Your own email: not an email address.';

export const whoPlaysWords = { adult: 'adults', youth: 'under-18s', mixed: 'adults and under-18s' };

const placeWords = (place) =>
  place.kind === 'folder'
    ? `the local database in ${place.folder}`
    : place.kind === 'postgres'
      ? `the database ${place.database} on ${place.host} (the migration login’s)`
      : 'a database in memory';

export const planLines = (plan, preview, place, staffEmail, address) => [
  '',
  'This will make:',
  `  League          ${plan.name}`,
  `  Address         ${address}`,
  `  Sport           ${plan.sportKey}`,
  `  Who plays       ${whoPlaysWords[plan.audience]}`,
  `  City            ${plan.city}`,
  `  Time zone       ${plan.timeZone}`,
  `  Contact email   ${plan.contactEmail}`,
  `  Owner           ${plan.ownerEmail}${preview.ownerHasAccount ? ' (has an account)' : ' (no account yet: theirs when they sign up with this email)'}`,
  `  Listed in /find ${plan.listed ? 'yes' : 'no'} (the owner can change it)`,
  `  First season    ${plan.season.name}, the current one`,
  '  State           draft: only the league’s own staff can see it until it is published',
  `  Made by         ${staffEmail}${preview.staffHasAccount ? '' : ' (an account is made for this email)'}`,
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
    'There is no database in that folder. Make the local test one with `npm run seed`.',
  'cannot-connect':
    'Could not reach the migration login’s database. Check MIGRATION_DATABASE_URL and MIGRATION_DATABASE_SSL.',
};

export const caUnreadable = 'The file named by MIGRATION_DATABASE_CA cannot be read.';
export const badSsl = 'MIGRATION_DATABASE_SSL must be verify, no-verify or off.';

export const makeProblems = {
  'schema-not-ready':
    'That database is missing migrations (the league’s city, 0014). Apply the migrations first. Nothing was made.',
  'short-name-held':
    'Another league has that short name, or its old address still forwards there. Choose another. Nothing was made.',
};

const stepWords = {
  league: 'making the league',
  season: 'adding its first season',
  'current-season': 'making that season the current one',
};

export const refused = (problem) =>
  problem.leagueId === undefined
    ? `Refused while ${stepWords[problem.step]} (${problem.code}). Nothing was made.`
    : `Refused while ${stepWords[problem.step]} (${problem.code}). The league was made in draft (id ${problem.leagueId}) and needs finishing by hand.`;

export const made = (outcome, plan, address) => [
  `Made: ${plan.name}, at ${address}, in draft, with ${plan.season.name} as its current season.`,
  outcome.ownerAccountMade
    ? `The owner, ${plan.ownerEmail}, owns it as soon as they sign up with that email.`
    : `The owner, ${plan.ownerEmail}, already has an account and owns it now.`,
  `League id: ${outcome.leagueId}`,
];
