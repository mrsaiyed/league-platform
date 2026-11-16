// Step 2.188's split of the English messages, kept so it can be done again at this step's
// catch-up with the build branch (record 072). It reads an en.ts of before the split (one
// object), and writes packages/site/src/messages/en/<area>.ts (each area's keys in
// alphabetical order, each with its text exactly as written and the comment above it),
// packages/site/src/messages/en.ts (the index that joins them), and the snapshot the proof
// test compares with (packages/site/src/messages/en-before-split.test-fixture.json, made
// by importing that same file). Not part of any check; run only for the split.
//
//   git show build/stage-1:packages/site/src/messages/en.ts > .local/en-before-split.ts
//   node scripts/split-messages-once.mjs .local/en-before-split.ts
//   npx prettier --write packages/site/src/messages
//   npx vitest run packages/site/src/messages        (en-split.test.ts: the same keys and texts)
//
// It refuses a key whose start has no area file below: give that start a file (or add it
// to one) here first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'packages/site/src/messages');
const sourcePath = process.argv[2];
if (!sourcePath || process.argv.length > 3) {
  console.error('Give the en.ts of before the split: split-messages-once.mjs <file>.');
  process.exit(1);
}
const source = fs.readFileSync(path.resolve(sourcePath), 'utf8');
const lines = source.split(/\r?\n/);
const start = lines.findIndex((l) => l === 'export const en = {');
const end = lines.findIndex((l) => l === '} as const;');
if (start < 0 || end < 0) {
  console.error(`${sourcePath} is not the one-object en.ts of before the split.`);
  process.exit(1);
}

// Each entry: its key, the comment lines above it, and its own lines (a long text goes on).
const entries = [];
let comments = [];
let current;
for (const line of lines.slice(start + 1, end)) {
  const key = /^ {2}'([^']+)':/.exec(line) ?? /^ {2}([A-Za-z_$][\w$]*):/.exec(line);
  if (key) {
    current = { key: key[1], comments, lines: [line] };
    entries.push(current);
    comments = [];
  } else if (/^ {2}\/\//.test(line)) {
    comments.push(line);
  } else if (/^ {4}/.test(line) && current && comments.length === 0) {
    current.lines.push(line);
  } else {
    throw new Error(`A line the split does not know: ${JSON.stringify(line)}`);
  }
}
if (comments.length) throw new Error('A comment after the last key.');
if (new Set(entries.map((e) => e.key)).size !== entries.length) throw new Error('A key twice.');

/** Each area file: what it holds, and the key starts ("a" or "a.b") that go in it. */
const files = {
  account: [
    'Accounts, signing in and who holds what',
    [
      'account',
      'access',
      'code',
      'confirm',
      'device',
      'email',
      'forgot',
      'password',
      'problem',
    ].concat(['role', 'signIn', 'signUp']),
  ],
  activity: ['The activity log', ['activity']],
  admin: ["The admin's frame and the areas not in a file of their own", ['admin']],
  'admin-games': [
    "The admin's games area, box scores and my games",
    ['admin.games', 'admin.boxScore', 'admin.myGames'],
  ],
  'admin-import': ["The admin's fixture import", ['admin.import']],
  'admin-settings': [
    "The admin's league and season settings, and the settings' own words",
    ['adminSettings', 'seasonSettings', 'setting'],
  ],
  'admin-teams': ["The admin's teams and rosters", ['adminTeams']],
  error: ['The refusals and errors of every area but scheduling', ['error']],
  'error-scheduling': ["Scheduling's refusals and errors", ['error.scheduling']],
  game: ["A game's page and the statistics' names", ['game', 'stat']],
  schedule: ['The public schedule and its links', ['schedule']],
  'schedule-admin': ["The admin's schedule screens", ['schedule.admin']],
  site: [
    "The public pages, ours and a league's: the frame, home, standings, statistics and teams",
    [
      'common',
      'display',
      'footer',
      'front',
      'home',
      'nav',
      'page',
      'shell',
      'site',
      'standIn',
    ].concat(['standings', 'stats', 'team', 'teams']),
  ],
  tracker: ['The tracker', ['tracker']],
  'tracker-states': [
    'The tracker when it refuses, is read-only, is not started or reopens',
    ['tracker.refusal', 'tracker.notStarted', 'tracker.readOnly', 'tracker.reopen'],
  ],
};
const byStart = new Map();
for (const [file, [, starts]] of Object.entries(files))
  for (const s of starts) byStart.set(s, file);
/** The area file a key goes in: its first two segments' file, else its first segment's. */
function areaOf(key) {
  const [a, b] = key.split('.');
  const file = byStart.get(`${a}.${b}`) ?? byStart.get(a);
  if (!file) throw new Error(`No area file for ${key}: give "${a}" a file here first.`);
  return file;
}
const camel = (file) =>
  'en' +
  file
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
const byCodeUnit = (x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);

const out = new Map(Object.keys(files).map((f) => [f, []]));
for (const e of entries) out.get(areaOf(e.key)).push(e);
fs.rmSync(path.join(dir, 'en'), { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'en'));
for (const [file, list] of out) {
  if (list.length === 0) throw new Error(`No key for ${file}.ts.`);
  list.sort(byCodeUnit);
  const text = [
    `// English interface text (T-187), one part of \`en\`, which ../en.ts joins:`,
    `// ${files[file][0]}.`,
    `// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).`,
    `// A comment above a key is about that key or, from before the split, about the keys`,
    `// that followed it in the one file there was.`,
    `export const ${camel(file)} = {`,
    ...list.flatMap((e) => [...e.comments, ...e.lines]),
    '} as const;',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'en', `${file}.ts`), text);
  console.log(`en/${file}.ts: ${list.length} keys`);
}

const names = [...out.keys()];
const mapLines = names.flatMap((f) => {
  const said = [];
  let line = `//   ${f}.ts: `;
  for (const [i, s] of files[f][1].entries()) {
    const word = s + (i < files[f][1].length - 1 ? ',' : '');
    if ((line + word).length > 100) {
      said.push(line.trimEnd());
      line = '//     ';
    }
    line += word + ' ';
  }
  said.push(line.trimEnd());
  return said;
});
const index = [
  '// English interface text (T-187). Components ask for a key; they never hold the words.',
  '// The keys live in files by area in ./en/, each in alphabetical order (step 2.188,',
  '// record 072), and this file joins them into the one object `en`. A new key goes in its',
  "// area's file in its alphabetical place; every other language must then have it too.",
  '// Which file a key goes in, by the start of the key:',
  ...mapLines,
  '// A new area of its own gets a file here, joined below in alphabetical order.',
  ...names.map((f) => `import { ${camel(f)} } from './en/${f}.ts';`),
  '',
  'export const en = {',
  ...names.map((f) => `  ...${camel(f)},`),
  '} as const;',
  '',
  'export type MessageKey = keyof typeof en;',
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'en.ts'), index);

// The snapshot for the proof, from the very file split: imported, so its texts are as
// TypeScript reads them.
const { en } = await import(pathToFileURL(path.resolve(sourcePath)).href);
fs.writeFileSync(
  path.join(dir, 'en-before-split.test-fixture.json'),
  `${JSON.stringify(en, null, 2)}\n`,
);
console.log(`en.ts joins ${names.length} files; ${Object.keys(en).length} keys in the snapshot.`);
