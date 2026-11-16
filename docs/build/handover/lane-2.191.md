# Lane 2.191: GitHub's check in parallel jobs (handover)

Branch `lane/2.191-ci-parallel` (also pushed as `lane/2.191-again`, the same commit checked a
second time). Opened from `build/stage-1` at 4ceb8cb4, merged `build/stage-1` once (434e521c)
for `push-lane.mjs`, `wait-for-github.mjs` and `heavy.mjs`. Step line: `docs/build/STAGE-2.md`,
search "2.191".

## The jobs (`.github/workflows/ci.yml`)

Same name ("Verify"), same events (`[push, pull_request]`), same `permissions: contents: read`,
same `NEXT_TELEMETRY_DISABLED`. Every job starts as the single job did: `actions/checkout@v4`,
`actions/setup-node@v4` with Node 24 and npm's cache, `npm ci`. No new action. No job has
`needs:` or a job-level `if:`, so none waits on another and none can be skipped. Both matrices
have `fail-fast: false`.

| Job (id)                     | What it runs                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks`                     | `npm run check && npm run typecheck && npm run format:check && npm run build:demo`, output kept; on failure `verify-failure-notes.mjs`                                           |
| `node-tests`                 | `npm test` (with its pretest); on failure `verify-failure-notes.mjs`                                                                                                             |
| `vitest-tests` (matrix 1..3) | `npm run test:units -- --shard=k/3` (vitest's own sharding: each test file in one part); on failure `verify-failure-notes.mjs`                                                   |
| `web-shell`                  | `npm run test:web`; on failure `verify-failure-notes.mjs`                                                                                                                        |
| `tracker-browser`            | `npm run build:demo`, `npx playwright install --with-deps chromium`, `test:browser`, `test:varsity:browser`, `test:stats:browser` (traced, with its notes), `test:pages:browser` |
| `web-browser` (matrix 1..3)  | `npx playwright install --with-deps chromium`, then `npm run test:web:browser -- --group=k/3` (traced, with its notes)                                                           |
| `hosted-build`               | unchanged                                                                                                                                                                        |

`k/3`: the workflow writes `${{ matrix.group }}/${{ strategy.job-total }}` (and `matrix.shard`
for vitest), so n is always the number of matrix entries.

`tracker-browser` runs `build:demo` itself because `test:browser` opens
`dist/Al-Hadi League Demo.html`, which `verify` used to build before it in the single job.

## The browser test groups

`scripts/run-web-browser-tests.mjs --group=<k>/<n>` (the rule is in
`scripts/web-browser-chain.mjs`): take the whole chain (the exit test first, then every other
`tests/browser/*-test.mjs` in alphabetical order), number its places from 0, and group k holds
the places that are k - 1 more than a multiple of n. So the exit test is always first in
group 1 and builds there, as in the whole chain. The first test of every other group builds
that group's own copy of the app (each test can build itself; the rest get `--no-build`). A
new test file is in a group by its name alone; nobody edits the workflow. The runner prints
`Browser tests to run in group k of n (m tests): …` before the first test and
`Browser tests passed in group k of n (m tests): …` at the end; `--list --group=k/n` prints a
group's chain. A group and test names together, two groups, `k > n` or an empty group are
refused with a sentence.

Today, with 17 tests: group 1 = web-exit, fixture-import, needs-result,
public-pages-on-database, schedule-grid, tracker-route; group 2 = after-midnight, games-area,
one-world, rounds, scoring-screen, undo-removing; group 3 = find-their-way, live-game,
privacy-names, saves-keep, season-shown.

Proof that nothing is left out, run in `node-tests` on every push
(`tests/ci-workflow.test.mjs`): every part of `verify` and every `test`/`test:*` script of
`package.json` is run by some job; the web groups and the vitest parts are matrices of exactly
1..n and the command takes n from the matrix; with the real folder the n groups together are
the whole chain, each test once, and no group is empty; no job has `needs:`/`if:`; only the two
actions; every job that opens a browser installs it first; the workflow does not reach the live
tracker (`reachesLiveSite` is false) and uses no secret. `tests/web-browser-chain.test.mjs`
proves the grouping for 1 to 6 groups on the real folder and on made-up folders.

## The one overall result

GitHub keeps a workflow run unfinished until every job in it has finished, and calls it
"success" only when no job failed, was cancelled or timed out. All three readers judge a commit
by its runs, so one run of several jobs is one result:

- `scripts/github-check.mjs`: unchanged verdict (`newestChecks`). Changed: on FAILED it now names
  each failed job and its failed step, `Failed in the job "web browser tests 2 of 3": npm run
test:web:browser (… UTC, … s)`, then that job's notes (the failing tests), and leaves out
  skipped jobs (`failedJobs`, `failedJobLine` in `scripts/github-check-rules.mjs`). It asks for
  jobs with `per_page=100`.
- `scripts/wait-for-github.mjs`: unchanged; it reads `newestChecks` and `verdict`.
- `scripts/promote-to-main.mjs`: the same rule moved into `commitCheck(runs, sha)` in
  `scripts/promote-rules.mjs` (passed / failed / running / unchecked), now tested. Its list of
  workflows that reach the live tracker does not include `ci.yml` (tested).

Tests added in `tests/github-check.test.mjs`, from made-up GitHub answers: one job failed and
the rest passed (FAILED, the job and step named), one job still running (still being checked),
one job queued (still being checked), every job passed (PASSED), each checked through all three
readers; a cancelled or timed-out job is named, a skipped one is not; a commit with no run is not
passed.

## Old step to new job

| Old step (job `checks`)            | Command                                                          | New job                                             |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| checkout, setup-node, npm ci       | as before                                                        | every job                                           |
| npm run verify: check              | `npm run check`                                                  | `checks`                                            |
| npm run verify: typecheck          | `npm run typecheck`                                              | `checks`                                            |
| npm run verify: test (and pretest) | `npm test`                                                       | `node-tests`                                        |
| npm run verify: test:units         | `npm run test:units`                                             | `vitest-tests` 1, 2, 3                              |
| npm run verify: test:web           | `npm run test:web`                                               | `web-shell`                                         |
| npm run verify: format:check       | `npm run format:check`                                           | `checks`                                            |
| npm run verify: build:demo         | `npm run build:demo`                                             | `checks` and `tracker-browser`                      |
| Say what failed in verify          | `node scripts/verify-failure-notes.mjs …`                        | `checks`, `node-tests`, `vitest-tests`, `web-shell` |
| playwright install                 | `npx playwright install --with-deps chromium`                    | `tracker-browser`, `web-browser` 1, 2, 3            |
| test:browser                       | `npm run test:browser`                                           | `tracker-browser`                                   |
| test:varsity:browser               | `npm run test:varsity:browser`                                   | `tracker-browser`                                   |
| test:stats:browser and its notes   | traced `npm run test:stats:browser`, `browser-failure-notes.mjs` | `tracker-browser`                                   |
| test:pages:browser                 | `npm run test:pages:browser`                                     | `tracker-browser`                                   |
| test:web:browser and its notes     | traced `npm run test:web:browser`, `browser-failure-notes.mjs`   | `web-browser` 1, 2, 3 (`--group=k/3`)               |
| job `hosted-build`                 | unchanged                                                        | `hosted-build`                                      |

## Every run seen on GitHub

The old single job, on `build/stage-1`: 073ae8f 778 s whole (verify 368 s, web browser tests
324 s), 2bd2b20 832 s (verify 402 s, web browser tests 320 s), all passed.

| Commit  | Branch                 | Whole | Result | Longest jobs                                                                                                                                                                        |
| ------- | ---------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| e5787f9 | lane/2.191-ci-parallel | 358 s | passed | unit tests (npm test + vitest in one job) 354 s; web group 2 245 s, 1 176 s, 3 89 s; tracker 97 s; checks 38 s; web shell 38 s                                                      |
| 8afbe6c | lane/2.191-ci-parallel | 476 s | passed | vitest alone 472 s (test:units 457 s); web group 2 249 s; node tests 70 s                                                                                                           |
| 9328480 | lane/2.191-ci-parallel | 282 s | passed | web group 2 229 s; vitest parts 129, 133, 165 s; web group 1 150 s; tracker 96 s; node tests 48 s. Every job started within 16 s except vitest 3 (+116 s) and hosted-build (+107 s) |
| 9328480 | lane/2.191-again       | 460 s | passed | the same jobs took 41 to 263 s, but jobs started up to 293 s late: the two runs together were 22 jobs at once                                                                       |

Nothing failed in any run. The job times come from GitHub's list of jobs, read without sign-in;
the logs themselves need sign-in, so they were not read from this computer.

## What is proved and what is not

- Proved: the whole result in 7 minutes or less, once: 282 s for 9328480, every job passed.
  The longest job's own time is 263 s in every run since the vitest split.
- Not proved: 7 minutes twice. The second check of the same commit, pushed at the same moment
  as the first, took 460 s, because its jobs waited for a free machine: GitHub runs at most 20
  jobs at once for this account, and two runs of 11 jobs each are 22. One push at a time should
  finish in about 5 minutes; two lanes pushed at the same minute will queue.
- Proved by the unit tests, not yet from logs: every part of `verify`, every test script and
  every browser test is in exactly one job (`tests/ci-workflow.test.mjs`). Not yet done: the
  count of node and vitest tests and the list of browser tests compared, old run against new,
  from the logs (see Next, 1).
- Not proved: FAILED on a deliberately failing browser test, naming it; and
  `promote-to-main.mjs` refusing that commit. Only the unit tests with made-up answers show it.

## Next, in order

1. Read the logs of run 43929037927 (9328480, signed in to GitHub) against an old single-job
   run on `build/stage-1` (43921498930, 073ae8f): node's `ℹ tests N` total (the new run should
   have 15 more, the tests this lane added: 4 in `web-browser-chain.test.mjs`, 5 in
   `github-check.test.mjs`, 6 in `ci-workflow.test.mjs`; plus whatever `build/stage-1` added
   between 073ae8f and the merge, so compare against a build-branch run of 4275626c if there
   is one), vitest's `Tests N passed` summed over its three parts against the old one total,
   and the browser tests: the old log's
   `+ node tests/browser/…` lines against the three groups' `Browser tests passed in group k
of 3` lines; all 17 once.
2. The throw-away proof: on a new commit add `tests/browser/zz-throwaway-fails-test.mjs`
   (`console.log('Throw-away browser check failed:'); console.log('  fails on purpose');
process.exit(1);`, it lands in group 3), push with `node scripts/push-lane.mjs`, wait with
   `node scripts/wait-for-github.mjs lane/2.191-ci-parallel`, see FAILED, and
   `node scripts/github-check.mjs lane/2.191-ci-parallel` name the job "web browser tests 3 of
   3" and the test; read `commitCheck` against that run ("failed": promote refuses). Then
   remove the file in the next commit, push, and see PASSED again.
3. If two runs at once must also finish in 7 minutes: fewer jobs per run (for example two web
   groups and two vitest parts, 9 jobs), measured the same way; then the lead lands the lane.
