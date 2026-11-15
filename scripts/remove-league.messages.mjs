// The words of scripts/remove-league.mjs (step 2.150, record 063): how to use it, its
// questions, the plan it shows before removing anything, and what came of it (T-187).
// Where it is, and why a login or the database is refused, are the same words as
// npm run league:make's, saying "removed" where those say "made".
import {
  checkBeforeAnswering as makerCheckBeforeAnswering,
  placeWords,
  readinessLines as makerReadinessLines,
  targetProblemLines as makerTargetProblemLines,
} from './make-league.messages.mjs';

export { placeWords };

export const usage = [
  'Removes a league made by mistake with npm run league:make: one still in draft, with no',
  'games, no people and no roles but its owner’s, exactly as that tool left it (step 2.150).',
  'It shows what it will remove and asks first: you answer by typing the league’s short name.',
  'A published or used league is not this tool’s to remove (step 2.133).',
  '',
  'npm run league:remove -- --short-name <name> --as <email>',
  '  --short-name <name>  the short name (address) of the league to remove',
  '  --as <email>         your own email, as SR Leagues staff',
  '  --db <folder>        a local test database folder (default: .local/seed-db)',
  '  --hosted             a hosted database instead, through the same two logins as',
  '                       npm run league:make (docs/operations/make-a-league.md)',
  '',
  'Where: on this computer unless told otherwise, in --db or the local test database in',
  '.local/seed-db, even when hosted settings are in .env.',
].join('\n');

export const questions = {
  shortName: 'Short name of the league to remove',
  staffEmail: 'Your own email (SR Leagues staff)',
};
export const plainQuestion = (question) => `${question}: `;
export const missing = (field) => `${questions[field]}: missing.`;
export const notInteractive =
  'Some answers are missing and this is not a terminal that can ask. Give them as options.';

/** The maker's sentence about what was not done, said for removing. */
const removing = (line) =>
  line
    .replaceAll('Nothing was made.', 'Nothing was removed.')
    .replaceAll('nothing was made.', 'nothing was removed.');

export const targetProblemLines = (problem) => makerTargetProblemLines(problem).map(removing);
export const readinessLines = (problem) => makerReadinessLines(problem).map(removing);
export const checkBeforeAnswering = makerCheckBeforeAnswering;

const stateWords = { live: 'published', archived: 'archived', suspended: 'suspended' };

/** What a table's rows are, in plain words, for the tables a used league most often has. */
const tableWords = {
  'public.games': 'games',
  'public.people': 'people',
  'public.role_grants': 'roles given to someone (ended ones count too)',
  'public.invitations': 'invitations',
  'public.setting_values': 'settings saved',
  'public.divisions': 'divisions',
  'public.teams': 'teams',
  'public.venues': 'venues',
  'public.courts': 'courts',
  'public.jobs': 'jobs waiting or done (emails, reminders and the like)',
  'public.league_slug_history': 'former short names still forwarding',
  'public.league_features': 'features switched on or off',
  'public.support_access_log': 'support visits by our staff',
  'public.command_receipts': 'changes made through the app',
  'public.imports': 'imports',
  'public.schedule_drafts': 'schedule drafts',
  'public.schedule_revisions': 'published schedules',
};

/** Why the league is not this tool's to remove (league_removal_problems). */
export const findingWords = (found) => {
  if (found.kind === 'state') return `it is ${stateWords[found.state] ?? found.state}`;
  if (found.kind === 'in-bin') return 'it is in the bin';
  if (found.kind === 'league-changed') {
    return 'it was changed after it was made (its name, short name, look or wording)';
  }
  if (found.kind === 'program-changed') return 'it has a second program, or its program changed';
  if (found.kind === 'season-changed') {
    return 'it has a second season, or its season was published, changed or put in the bin';
  }
  if (found.kind === 'activity') {
    return 'its activity log holds changes made after it was set up, or by someone else';
  }
  const what = tableWords[found.table];
  return what === undefined
    ? `it has ${found.count} rows in ${found.table}`
    : `it has ${what}: ${found.count}`;
};

export const notThisToolsToRemove =
  'A published or used league is not this tool’s to remove: that is step 2.133 (handing over, deleting and leaving). Nothing was removed.';

export const inUseLines = (league, found) => [
  `${league.name} (${league.slug}) is not what npm run league:make leaves, so it is not removed. Found:`,
  ...found.map((f) => `  - ${findingWords(f)}`),
  notThisToolsToRemove,
];

/** Why the owner's account is kept (owner-account.ts). */
const keptWords = {
  'signed-in': 'it has signed in before',
  used: 'it changed after it was made (a name, a phone, a profile or a visit)',
  'owns-league': 'it owns another league',
  'has-roles': 'it has, or had, a role in a league',
  'is-staff': 'it is your own account',
  'still-used': 'something else in the database still points at it',
  unknown: 'it could not be told for certain that nobody used it',
};
const keptReasons = (kept) => kept.map((k) => keptWords[k] ?? k).join('; ');

const indent = '                  ';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** How long ago something was, in plain words: "just now", "40 minutes ago", "3 days ago". */
export const agoWords = (ms) => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${plural(minutes, 'minute', 'minutes')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${plural(hours, 'hour', 'hours')} ago`;
  return `${plural(Math.floor(hours / 24), 'day', 'days')} ago`;
};

/** Whether the owner has signed in, so the plan says so and the owner's email is asked too. */
export const ownerHasSignedIn = (preview) => preview.ownerKept.includes('signed-in');

/** On a line of its own when the owner has signed in (area 5 review, M3). */
export const ownerSignedInLine =
  'Its owner has already signed in. They will find their league gone.';

export const planLines = (preview, place, nowMs) => {
  const { league, ownerKept } = preview;
  const seasons = league.seasons.length === 0 ? 'none' : league.seasons.join(', ');
  return [
    '',
    'This will remove, in one step:',
    `  League          ${league.name}`,
    `  Short name      ${league.slug} (free for another league afterwards)`,
    `  Made            ${league.madeAt} (${agoWords(nowMs - league.madeAtMs)})${league.madeByEmail === null ? '' : `, by ${league.madeByEmail}`}`,
    `  State           ${league.status}`,
    `  City            ${league.city ?? '(none given)'}`,
    `  Season          ${seasons}`,
    '  With it         its default program, and the two lines its making wrote in its own',
    `${indent}activity log`,
    ownerKept.length === 0
      ? `  Owner’s account ${league.ownerEmail}: removed too (nobody has ever signed in with it, and nothing else uses it)`
      : `  Owner’s account ${league.ownerEmail}: kept, because ${keptReasons(ownerKept)}`,
    '  Kept            one line in the platform’s own log: who removed it, and when',
    `  Where           ${placeWords(place)}`,
    '',
    ...(ownerHasSignedIn(preview) ? [ownerSignedInLine, ''] : []),
  ];
};

/** Asked as well, after the short name, when the owner has signed in. */
export const confirmOwner = 'To remove it anyway, also type the owner’s email address: ';
export const ownerEmailWrong =
  'That is not the owner’s email address, exactly. Nothing was removed.';
export const changedSincePlan =
  'The league with that short name is not the one this plan showed: it was removed, made again or changed since. Nothing was removed. Run this again to see a new plan.';

/** Answered by typing the short name, on this computer as on a hosted database. */
export const confirm = 'To remove it, type the league’s short name: ';
export const notRemoved = 'Nothing was removed.';
export const stopped = 'Stopped. Nothing was removed.';
export const needsTerminal =
  'It asks before removing anything, and this is not a terminal that can ask: run it in a terminal.';
export const typedWrong = 'That is not the league’s short name, exactly. Nothing was removed.';
export const notFound = (slug) =>
  `No league has the short name ${slug} on that database (it may have been removed already). Nothing was removed.`;
export const staffUnknown = (email) =>
  `No account has the email ${email} on that database. Give your own email as SR Leagues staff. Nothing was removed.`;

const withCode = (code) => (code === undefined ? '' : ` (${code})`);

/** What a run that removed nothing says (removeLeague's problem). */
export const removeProblemLines = (problem, request) => {
  if (problem.kind === 'login' || problem.kind === 'migrations') return readinessLines(problem);
  if (problem.kind === 'not-found') return [notFound(request.slug)];
  if (problem.kind === 'staff-unknown') return [staffUnknown(request.staffEmail)];
  if (problem.kind === 'short-name-differs') return [typedWrong];
  if (problem.kind === 'changed-since-plan') return [changedSincePlan];
  if (problem.kind === 'owner-email-differs') return [ownerEmailWrong];
  if (problem.kind === 'in-use') {
    return [
      `It is not what npm run league:make leaves, so it is not removed. Found:`,
      ...problem.found.map((f) => `  - ${findingWords(f)}`),
      notThisToolsToRemove,
    ];
  }
  if (problem.league === 'removed') {
    return [
      `Something went wrong${withCode(problem.reason)} after the league was removed. It is gone, with its season; the owner’s account was not touched and is still there.`,
    ];
  }
  if (problem.league === 'unknown') {
    return [
      `Something went wrong${withCode(problem.reason)}, and whether the league was removed is not known: it could not be checked. Nothing else was touched.`,
      'Run this again with the same answers: it will say whether the league is still there.',
    ];
  }
  return [
    `Something went wrong${withCode(problem.reason)}. The league is still there, whole. Nothing was removed.`,
  ];
};

/** Anything the script did not expect, before it began removing. */
export const unexpected = (code) =>
  `Something went wrong${withCode(code)} before anything was removed. Nothing was removed.`;
/** Anything the script did not expect once it had begun removing. */
export const unexpectedWhileRemoving = (code) =>
  `Something went wrong${withCode(code)} while removing the league, and it is not known what was removed. Run this again with the same answers: it will say whether the league is still there.`;

const yesNo = (ok) => (ok ? 'as it should be' : 'NOT as it should be: look into it');

/** What the database holds now, read back, so nobody has to query it. */
const readBackLines = (removed, staffEmail) => {
  const facts = removed.readBack;
  if (facts === undefined) {
    return [
      'It could not be read back: look in the database for the league (it should be gone) and the platform log’s line.',
    ];
  }
  const entryRight =
    facts.entry !== undefined &&
    facts.entry.action === 'leagues.remove_draft' &&
    facts.entry.leagueId === removed.leagueId &&
    (facts.entry.actorEmail ?? '').toLowerCase() === staffEmail.toLowerCase();
  const ownerRight = removed.owner.removed ? !facts.ownerAccountThere : facts.ownerAccountThere;
  return [
    'Read back from the database:',
    `  League          ${facts.rowsLeft === 0 ? 'gone: nothing of it is left in any table' : `${facts.rowsLeft} of its rows still there`} (${yesNo(facts.rowsLeft === 0)})`,
    `  Short name      ${facts.shortNameFree ? 'free' : 'still held'} (${yesNo(facts.shortNameFree)})`,
    `  Platform log    ${facts.entry === undefined ? 'no line' : `${facts.entry.action} of ${facts.entry.slug} by ${facts.entry.actorEmail ?? 'nobody named'}`} (${yesNo(entryRight)})`,
    `  Owner’s account ${facts.ownerAccountThere ? 'still there' : 'gone'} (${yesNo(ownerRight)})`,
  ];
};

export const removedLines = (removed, staffEmail) => [
  `Removed: ${removed.name} (${removed.slug}), with its season, its program and the two lines its making wrote in its own activity log.`,
  removed.owner.removed
    ? `The owner’s account (${removed.ownerEmail}) was removed too: nobody had ever signed in with it.`
    : `The owner’s account (${removed.ownerEmail}) was kept: ${keptReasons(removed.owner.kept)}.`,
  `The platform’s own log keeps one line about it (league id ${removed.leagueId}).`,
  ...readBackLines(removed, staffEmail),
  'Nothing was sent to anyone.',
  ...(!removed.owner.removed && removed.owner.kept.includes('signed-in')
    ? [
        `Its owner had already signed in: tell them yourself, at ${removed.ownerEmail}, that the league was removed.`,
      ]
    : []),
];
