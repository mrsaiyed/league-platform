// Sends the lane you stand in to GitHub, so that its machines run the whole gate on it.
// It pushes that one lane branch and can push nothing else: not the build branch, not main.
//
//   node scripts/push-lane.mjs             this lane's newest commit
//   node scripts/push-lane.mjs --times=2   the same commit under a second name too, so that
//                                          GitHub checks it twice and a failure by chance shows
//
// GitHub's machines are not slowed by what this computer is doing, so the whole gate
// belongs there (docs/build/RUNBOOK.md, section 3). Push as soon as there is something
// worth checking, then wait for the result with one command and no loop:
//   node scripts/wait-for-github.mjs <the names this printed>
import { spawnSync } from 'node:child_process';
import { pushNames } from './lane-github-rules.mjs';

const git = (...args) => spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
const out = (result) => (result.stdout ?? '').trim();
const options = process.argv.slice(2);
const unknown = options.filter((option) => !/^--times=[123]$/.test(option));
if (unknown.length > 0) {
  console.log(
    `Refused: this script takes only --times=1, --times=2 or --times=3 (got ${unknown.join(' ')}).`,
  );
  process.exit(2);
}
const branch = out(git('rev-parse', '--abbrev-ref', 'HEAD'));
const names = pushNames(branch, (options[0] ?? '--times=1').slice(8));
if (!names) {
  console.log(
    `Refused: "${branch}" is not a lane's own branch. This script pushes only the lane it stands in (lane/...). The build branch and main are the lead's.`,
  );
  process.exit(2);
}
const commit = out(git('rev-parse', 'HEAD'));
if (out(git('status', '--porcelain', '--untracked-files=no')) !== '') {
  console.log('Note: some changes here are not committed. GitHub checks only what is committed.');
}
for (const name of names) {
  const pushed = git('push', 'origin', `HEAD:refs/heads/${name}`);
  if (pushed.status !== 0) {
    console.log(`Could not push ${name}:\n${(pushed.stderr ?? '').trim()}`);
    console.log('Nothing was forced. Tell the lead what this says.');
    process.exit(1);
  }
  console.log(`pushed ${commit.slice(0, 7)} as ${name}`);
}
console.log(
  "Now wait for GitHub's result with one command, time limit 600000, no loop and no sleep:",
);
console.log(`  node scripts/wait-for-github.mjs ${names.join(' ')}`);
