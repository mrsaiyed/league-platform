// Where the web app listens (scripts/web-listen.mjs, step 2.152, review 2 M1). On the
// made-up stand-in it listens on this computer's loopback address only, so no other
// computer can reach it; on a database it listens as before. And no place in this
// repository starts the web app's server without passing its arguments through
// withLoopback: a new starter that forgets fails here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loopback, runsOnStandIn, withLoopback } from '../scripts/web-listen.mjs';

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

test('settings that do not plainly name a database run on the stand-in', () => {
  assert.equal(runsOnStandIn({}), true);
  assert.equal(runsOnStandIn({ APP_ENV: 'local', LOCAL_DATA: 'stand-in' }), true);
  assert.equal(runsOnStandIn({ APP_ENV: 'something-else' }), true);
  assert.equal(runsOnStandIn({ APP_ENV: 'test', LOCAL_DATA: 'made-up-database' }), false);
  assert.equal(runsOnStandIn({ APP_ENV: 'staging' }), false);
  assert.equal(runsOnStandIn({ APP_ENV: 'production' }), false);
});

test('on a database, and when building, the arguments are as given', () => {
  const asked = ['start', '--hostname', '0.0.0.0', '--port', '1'];
  assert.deepEqual(withLoopback(asked, { APP_ENV: 'staging' }), asked);
  assert.deepEqual(withLoopback(asked, { APP_ENV: 'test', LOCAL_DATA: 'made-up-database' }), asked);
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

test('every place that starts the web app passes its arguments through withLoopback', () => {
  const scripts = repositoryFiles().filter((file) => /\.(?:mjs|cjs|js|ts)$/.test(file));
  const starters = [];
  const problems = [];
  // Written in parts so that this file itself is not read as a starter.
  const starterPath = `'${['next', 'dist', 'bin', 'next'].join('/')}'`;
  for (const file of scripts) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (!text.includes(starterPath)) continue;
    const named = /const (\w+) = [^\n]*\.resolve\('next\/dist\/bin\/next'\)/.exec(text);
    if (named === null) {
      problems.push(`${file}: finds Next.js's starter without naming it, so cannot be checked`);
      continue;
    }
    const name = named[1];
    starters.push(file);
    const uses = text.split(name).length - 2; // less the declaration
    const build = text.split(`[${name}, 'build']`).length - 1;
    const wrapped = text.split(`[${name}, ...withLoopback(`).length - 1;
    if (uses !== build + wrapped) {
      problems.push(
        `${file}: starts Next.js ${uses - build - wrapped} time(s) without withLoopback (scripts/web-listen.mjs)`,
      );
    }
    if (
      wrapped > 0 &&
      !/import \{[^}]*\bwithLoopback\b[^}]*\} from '[^']*web-listen\.mjs'/.test(text)
    ) {
      problems.push(`${file}: does not take withLoopback from scripts/web-listen.mjs`);
    }
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

test('no npm script starts Next.js itself, around scripts/web.mjs', () => {
  const packages = repositoryFiles().filter((file) => path.basename(file) === 'package.json');
  for (const file of packages) {
    const { scripts = {} } = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const [name, command] of Object.entries(scripts)) {
      assert.doesNotMatch(command, /\bnext\s+(?:dev|start)\b/, `${file} "${name}"`);
    }
  }
});
