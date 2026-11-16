// For a lane merged with the build branch after step 2.188 split the English messages:
// lists every message the lane itself added or changed in the old one-object en.ts, and
// checks that each is in the joined messages (packages/site/src/messages/en.ts and ./en/)
// of this folder with the same text (scripts/lane-messages-rules.mjs).
//
//   node scripts/check-lane-messages.mjs <base> [<lane>]
//
// <base> is the commit the lane started from (its merge base with the build branch from
// before step 2.188); <lane> is the lane's own last commit before the merge. Left out, it
// is HEAD while a merge is under way, or the first parent of HEAD once the merge is
// committed. Run it before settling the messages, to see the list, and again after: it must
// print nothing missing or different. Exits 1 when something is.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { laneChanges, laneMessageProblems, oldCatalog } from './lane-messages-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = 'packages/site/src/messages/en.ts';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const [base, given, ...rest] = process.argv.slice(2);
if (!base || rest.length > 0 || base.startsWith('-')) {
  console.error(
    'Give the base commit, and if you like the lane commit: check-lane-messages.mjs <base> [<lane>].',
  );
  process.exit(1);
}
let lane = given;
if (!lane) {
  const gitDir = path.resolve(root, git('rev-parse', '--git-dir').trim());
  const merging = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));
  const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ').length - 1;
  lane = !merging && parents > 1 ? 'HEAD^1' : 'HEAD';
}
console.log(`The lane's messages: ${file} from ${base} to ${lane}.`);

let changes;
try {
  changes = laneChanges(
    oldCatalog(git('show', `${base}:${file}`), `${base}:${file}`),
    oldCatalog(git('show', `${lane}:${file}`), `${lane}:${file}`),
  );
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
const { en } = await import(pathToFileURL(path.join(root, file)).href);
console.log(`${changes.length} message(s) the lane added or changed:`);
for (const [key] of changes) console.log(`  ${key}`);
const problems = laneMessageProblems(changes, en);
for (const problem of problems) console.log(problem);
if (problems.length > 0) {
  console.log(`${problems.length} of them missing or different in the joined messages.`);
  process.exit(1);
}
console.log('Each is in the joined messages with the same text: nothing missing.');
