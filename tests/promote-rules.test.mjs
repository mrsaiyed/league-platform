// The rules that guard GitHub's `main` (scripts/promote-rules.mjs), and the promise the
// publish workflow makes: the live tracker is built from one fixed commit, and an ordinary
// push to main does not publish anything.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  decideMove,
  pinnedCommit,
  publishWorkflow,
  reachesLiveSite,
  runsOnlyOnItsOwnChange,
} from '../scripts/promote-rules.mjs';

const real = fs.readFileSync(new URL(`../${publishWorkflow}`, import.meta.url), 'utf8');
const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);
const pinnedTo = (commit) => real.replace(/ref: [0-9a-f]{40}/, `ref: ${commit}`);
const everyPush = real.replace("    paths: ['.github/workflows/demo-pages.yml']\n", '');
const keepAwake = 'env:\n  SUPABASE_URL: ${{ vars.SUPABASE_URL }}\n';
const awakeFile = '.github/workflows/keep-supabase-awake.yml';
const live = (commit) => ({ [publishWorkflow]: pinnedTo(commit), [awakeFile]: keepAwake });
const decide = (over) =>
  decideMove({
    before: live(commitA),
    after: live(commitA),
    pinInBranch: true,
    releaseArg: '',
    gameNear: '',
    ...over,
  });

test('the publish workflow builds the live tracker from one fixed commit', () => {
  assert.match(pinnedCommit(real), /^[0-9a-f]{40}$/);
});

test('the publish workflow runs only when it itself changes', () => {
  assert.equal(runsOnlyOnItsOwnChange(real), true);
  assert.equal(runsOnlyOnItsOwnChange(everyPush), false);
});

test('a workflow that names no full commit, or checks out twice, is not pinned', () => {
  assert.equal(pinnedCommit(pinnedTo(commitA)), commitA);
  assert.equal(pinnedCommit(real.replace(/ref: [0-9a-f]{40}/, 'ref: main')), '');
  assert.equal(pinnedCommit(real.replace(/ref: [0-9a-f]{40}/, 'ref: 0259e87')), '');
  assert.equal(pinnedCommit(real.replace(/\n {8}with:\n(?: {10}#[^\n]*\n)* {10}ref: \S+/, '')), '');
  assert.equal(pinnedCommit(`${real}      - uses: actions/checkout@v4\n`), '');
  assert.equal(pinnedCommit(real.replace(/\n/g, '\r\n')), pinnedCommit(real));
});

test('workflows that can publish the site or use the live database are watched', () => {
  assert.equal(reachesLiveSite(publishWorkflow, ''), true);
  assert.equal(reachesLiveSite(awakeFile, keepAwake), true);
  assert.equal(reachesLiveSite('.github/workflows/new.yml', 'uses: actions/deploy-pages@v4'), true);
  assert.equal(reachesLiveSite('.github/workflows/new.yml', 'permissions:\n  pages: write'), true);
  assert.equal(reachesLiveSite('.github/workflows/ci.yml', 'run: npm run verify'), false);
});

test('an ordinary move goes through when nothing that reaches the tracker changed', () => {
  const decision = decide({});
  assert.equal(decision.move, 'ordinary');
  assert.equal(decision.pin, commitA);
});

test('an ordinary move does not care about games', () => {
  assert.equal(decide({ gameNear: '2026-11-16T17:30:00-06:00' }).move, 'ordinary');
});

test('nothing moves while the publish workflow is not pinned', () => {
  const unpinned = { [publishWorkflow]: real.replace(/ref: [0-9a-f]{40}/, 'ref: main') };
  assert.match(decide({ before: unpinned, after: unpinned }).refuse, /one fixed commit/);
  const loose = { [publishWorkflow]: everyPush };
  assert.match(decide({ before: loose, after: loose }).refuse, /one fixed commit/);
  assert.match(decide({ after: {} }).refuse, /one fixed commit/);
});

test('nothing moves when the pinned commit is not part of the build branch', () => {
  assert.match(decide({ pinInBranch: false }).refuse, /not part of the build branch/);
});

test('an ordinary move refuses a change to what reaches the tracker', () => {
  assert.match(decide({ after: live(commitB) }).refuse, /release of the tracker/);
  const awakeChanged = { ...live(commitA), [awakeFile]: `${keepAwake}# changed\n` };
  assert.match(decide({ after: awakeChanged }).refuse, /keep-supabase-awake/);
  const added = { ...live(commitA), '.github/workflows/new.yml': 'uses: actions/deploy-pages@v4' };
  assert.match(decide({ after: added }).refuse, /new\.yml/);
  const removed = { [publishWorkflow]: pinnedTo(commitA) };
  assert.match(decide({ after: removed }).refuse, /keep-supabase-awake/);
});

test('a release needs the right commit, a real change and no game near', () => {
  const release = { after: live(commitB), releaseArg: commitB };
  assert.deepEqual(decide(release), {
    move: 'release',
    pin: commitB,
    from: commitA,
    changed: [publishWorkflow],
  });
  assert.equal(decide({ ...release, releaseArg: commitB.slice(0, 7) }).move, 'release');
  assert.match(decide({ ...release, releaseArg: commitA }).refuse, /--release-tracker says/);
  assert.match(decide({ ...release, releaseArg: 'bbb' }).refuse, /--release-tracker says/);
  assert.match(decide({ releaseArg: commitA }).refuse, /nothing to release/);
  assert.match(
    decide({ ...release, gameNear: '2026-11-16T17:30:00-06:00' }).refuse,
    /never released around games/,
  );
});

test('the first release, from a main that is not pinned yet, is a release', () => {
  const decision = decide({
    before: {
      [publishWorkflow]: everyPush.replace(/\n {8}with:\n(?: {10}#[^\n]*\n)* {10}ref: \S+/, ''),
    },
    after: { [publishWorkflow]: pinnedTo(commitA) },
    releaseArg: commitA,
  });
  assert.equal(decision.move, 'release');
  assert.equal(decision.from, '');
});
