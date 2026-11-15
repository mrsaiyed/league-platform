// Where the web app listens (scripts/web-listen.mjs, step 2.152, review 2 M1 and review 3
// L2). In local work and tests, on the made-up stand-in or the made-up database, it
// listens on this computer's loopback address only, so no other computer can reach it; a
// deployed server listens as it is told. And no place in this repository starts the web
// app's server without passing its arguments through withLoopback: a new starter that
// forgets fails here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listensOnLoopbackOnly, loopback, withLoopback } from '../scripts/web-listen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standIn = { APP_ENV: 'test' };

test('the stand-in listens on the loopback address only, whatever else was asked', () => {
  assert.equal(loopback, '127.0.0.1');
  assert.deepEqual(withLoopback(['start', '--port', '3000'], standIn), [
    'start',
    '--port',
    '3000',
    '--hostname',
    '127.0.0.1',
  ]);
  assert.deepEqual(withLoopback(['dev'], { APP_ENV: 'local' }), ['dev', '--hostname', '127.0.0.1']);
  for (const asked of [
    ['start', '--hostname', '0.0.0.0', '--port', '1'],
    ['start', '-H', '0.0.0.0', '--port', '1'],
    ['start', '--hostname=0.0.0.0', '--port', '1'],
    ['start', '-H=::', '--port', '1'],
  ]) {
    assert.deepEqual(withLoopback(asked, standIn), [
      'start',
      '--port',
      '1',
      '--hostname',
      '127.0.0.1',
    ]);
  }
});

test('local work and tests listen on loopback only, whatever LOCAL_DATA says', () => {
  assert.equal(listensOnLoopbackOnly({}), true);
  assert.equal(listensOnLoopbackOnly({ APP_ENV: 'local', LOCAL_DATA: 'stand-in' }), true);
  assert.equal(listensOnLoopbackOnly({ APP_ENV: 'something-else' }), true);
  // The made-up database's made-up member signs in with a password written in the code.
  for (const APP_ENV of ['local', 'test']) {
    const env = { APP_ENV, LOCAL_DATA: 'made-up-database' };
    assert.equal(listensOnLoopbackOnly(env), true, APP_ENV);
    assert.deepEqual(
      withLoopback(['start', '--hostname', '0.0.0.0', '--port', '1'], env),
      ['start', '--port', '1', '--hostname', '127.0.0.1'],
      APP_ENV,
    );
    assert.deepEqual(withLoopback(['dev'], env), ['dev', '--hostname', '127.0.0.1'], APP_ENV);
  }
  assert.equal(listensOnLoopbackOnly({ APP_ENV: 'staging' }), false);
  assert.equal(listensOnLoopbackOnly({ APP_ENV: 'production' }), false);
});

test('on a deployed server, and when building, the arguments are as given', () => {
  const asked = ['start', '--hostname', '0.0.0.0', '--port', '1'];
  for (const APP_ENV of ['staging', 'production']) {
    assert.deepEqual(withLoopback(asked, { APP_ENV }), asked, APP_ENV);
    assert.deepEqual(withLoopback(asked, { APP_ENV, LOCAL_DATA: 'made-up-database' }), asked);
  }
  assert.deepEqual(withLoopback(['build'], standIn), ['build']);
});

/** Every file in this repository (tracked, or new and not ignored), apart from libraries. */
function repositoryFiles() {
  const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(listed.status, 0, 'git could not list the files');
  return listed.stdout
    .split('\n')
    .filter((file) => file !== '' && !file.split('/').includes('node_modules'))
    .filter((file) => fs.existsSync(path.join(root, file)));
}

/** Next.js's own starter, in any quotes: '…', "…" or `…`. */
const starterPath = /(['"`])next\/dist\/bin\/next\1/;
/**
 * Other ways a script can start Next.js: `next dev` or `next start` in a string, as exec, npx
 * or a shell would be given it (at the string's start, or after npx, a path or a shell's
 * `&&`, `;` or `|`, so a sentence like "on the next start" is not one); ['next', 'dev'] as
 * the arguments of spawn or npx; and spawn('next', …) or exec('next …'), `next` with no
 * command being `next dev`.
 */
const otherStarts = [
  /(['"`])(?:(?:(?!\1)[^\n])*?(?:\bnpx(?:\.cmd)?\s+|&&\s*|;\s*|\|\s*|\/))?next(?:\.cmd)?\s+(?:dev|start)\b/,
  /\[\s*(['"`])next\1\s*,\s*(['"`])(?:dev|start)\2/,
  /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(\s*(['"`])(?:npx\s+)?next(?:\.cmd)?(?:\s[^\n]*?)?\1/,
  /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*(['"`])npx(?:\.cmd)?\1\s*,\s*\[\s*(['"`])next\2/,
];

/** The file without its comment lines: a comment that names `next start` starts nothing. */
const withoutCommentLines = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
    .join('\n');

/**
 * Whether a script starts Next.js, and what is wrong with how: every start must go through
 * the one named starter, its arguments passed through withLoopback, or be a build.
 */
function readStarter(file, text) {
  const code = withoutCommentLines(text);
  const problems = [];
  if (otherStarts.some((pattern) => pattern.test(code))) {
    problems.push(
      `${file}: starts Next.js through a command (next dev or start, npx, spawn or exec), not its named starter with withLoopback`,
    );
  }
  if (!starterPath.test(code)) return { starts: problems.length > 0, problems };
  const named = /const (\w+) = [^\n]*\.resolve\((['"`])next\/dist\/bin\/next\2\)/.exec(code);
  if (named === null) {
    problems.push(`${file}: finds Next.js's starter without naming it, so cannot be checked`);
    return { starts: true, problems };
  }
  const name = named[1];
  const uses = code.split(name).length - 2; // less the declaration
  const builds = (code.match(new RegExp(`\\[${name}, (['"\`])build\\1\\]`, 'g')) ?? []).length;
  const wrapped = code.split(`[${name}, ...withLoopback(`).length - 1;
  if (uses !== builds + wrapped) {
    problems.push(
      `${file}: starts Next.js ${uses - builds - wrapped} time(s) without withLoopback (scripts/web-listen.mjs)`,
    );
  }
  if (
    wrapped > 0 &&
    !/import \{[^}]*\bwithLoopback\b[^}]*\} from (['"])[^'"]*web-listen\.mjs\1/.test(code)
  ) {
    problems.push(`${file}: does not take withLoopback from scripts/web-listen.mjs`);
  }
  return { starts: true, problems };
}

test('the scan of starters finds Next.js started in any way it can be written', () => {
  const resolved = (quote) =>
    `const nextBin = require.resolve(${quote}next/dist/bin/next${quote});\n` +
    "import { withLoopback } from './web-listen.mjs';\n";
  // Each starts Next.js and is refused.
  const refused = {
    'starter, double quotes, not wrapped': `${resolved('"')}spawn(process.execPath, [nextBin, "start"]);`,
    'starter, back quotes, not wrapped': `${resolved('`')}spawn(process.execPath, [nextBin, 'dev']);`,
    'starter not named': 'spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev"]);',
    'npx next dev in a string': "execSync('npx next dev --port 3000');",
    'next start in a template': 'exec(`next start --port ${port}`);',
    'npm script of next start': 'spawn("sh", ["-c", "next start"]);',
    'npx with next and dev': "spawn('npx', ['next', 'dev']);",
    'npx.cmd with next': "spawnSync('npx.cmd', ['next', '--port', '1']);",
    'next as the command': "spawn('next', ['start', '--port', '1']);",
    'next with no command': "exec('next');",
    'next and start as arguments': "run(['next', 'start']);",
  };
  for (const [what, text] of Object.entries(refused)) {
    const read = readStarter('made-up.mjs', text);
    assert.equal(read.starts, true, what);
    assert.notDeepEqual(read.problems, [], what);
  }
  // Each starts Next.js as it must, in any quotes, or only builds it.
  const kept = {
    'single quotes': `${resolved("'")}spawn(process.execPath, [nextBin, ...withLoopback(args, env)]);`,
    'double quotes': `${resolved('"')}spawn(process.execPath, [nextBin, ...withLoopback(args, env)]);`,
    'a build': `${resolved("'")}spawnSync(process.execPath, [nextBin, 'build']);`,
  };
  for (const [what, text] of Object.entries(kept)) {
    assert.deepEqual(readStarter('made-up.mjs', text), { starts: true, problems: [] }, what);
  }
  // A comment or a word that only looks like it starts nothing.
  for (const text of [
    '// the app is started with next start',
    "test('a database gains them on the next start', () => {});",
    "const asked = params.get('next');",
    'throw new Error(`next ${args[0]} failed`);',
  ]) {
    assert.deepEqual(readStarter('made-up.mjs', text), { starts: false, problems: [] }, text);
  }
});

test('every place that starts the web app passes its arguments through withLoopback', () => {
  // This file holds made-up starters to test the scan: it is not one itself.
  const self = path
    .relative(root, fileURLToPath(import.meta.url))
    .split(path.sep)
    .join('/');
  const scripts = repositoryFiles().filter(
    (file) => /\.(?:mjs|cjs|js|mts|cts|ts|tsx)$/.test(file) && file !== self,
  );
  const starters = [];
  const problems = [];
  for (const file of scripts) {
    const read = readStarter(file, fs.readFileSync(path.join(root, file), 'utf8'));
    if (read.starts) starters.push(file);
    problems.push(...read.problems);
  }
  assert.deepEqual(problems, []);
  // The scan finds the starters there are today, so it cannot pass by finding none.
  for (const known of [
    'scripts/web.mjs',
    'scripts/preview-web.mjs',
    'scripts/check-web-shell.mjs',
    'scripts/shots.mjs',
    'tests/browser/web-browser-kit.mjs',
    'tests/browser/web-exit-test.mjs',
    'tests/browser/schedule-grid-test.mjs',
  ]) {
    assert.ok(starters.includes(known), `${known} was not found starting Next.js`);
  }
});

/**
 * An npm script that starts Next.js itself: `next dev`, `next start`, `next` with no command
 * or only options (which is `next dev`), through npx or not, or Next.js's own starter run
 * with node. `next build` builds and starts nothing.
 */
const npmStart =
  /(?:^|[\s;&|(/])next(?:\.cmd)?(?:\s+(?:dev|start)\b|\s*$|\s*[;&|)]|\s+-)|next\/dist\/bin\/next/;

test('no npm script starts Next.js itself, around scripts/web.mjs', () => {
  for (const command of [
    'next dev',
    'next start --port 3000',
    'npx next dev',
    'next',
    'next --port 3000',
    'cd apps/web && next',
    'node node_modules/next/dist/bin/next start',
  ]) {
    assert.match(command, npmStart, command);
  }
  for (const command of ['next build', 'node scripts/web.mjs dev', 'eslint --fix next.config.ts']) {
    assert.doesNotMatch(command, npmStart, command);
  }
  const packages = repositoryFiles().filter((file) => path.basename(file) === 'package.json');
  for (const file of packages) {
    const { scripts = {} } = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const [name, command] of Object.entries(scripts)) {
      assert.doesNotMatch(command, npmStart, `${file} "${name}"`);
    }
  }
});
