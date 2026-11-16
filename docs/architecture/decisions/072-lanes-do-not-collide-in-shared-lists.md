# 072 — Lanes do not collide in shared lists

Date: 2026-11-16. Step 2.188 (T-276). Serves T-16 (the gate), T-185 (the spec stays true), T-187 (message files), T9 sections 3 and 13, the runbook's section 3. Decided by the lead; built by the builder of step 2.188.

## Problem

Six builders work side by side, each in a lane of its own (a git worktree), and each lane is merged with the build branch before it lands. Over three days 74 of 193 such merges collided, nearly all in a handful of shared files, and each collision cost a merge by a helper and another pass on GitHub. Replayed with `git merge-tree` (every merge on the build branch since November 12: 108 of 347 merges collide when made again), the files and the causes:

- **`docs/specs/v1/DECISIONS.md`, 49 replayed collisions.** Two causes, both seen. In 32 both sides only added rows at the same end of the same table (the change log, or a table of the full list: `T-272` against `T-273`, `T-260` against `T-259`). In 17 a whole table was the conflict: Prettier pads every row of a table to its widest cell, so a row with one cell wider than any before rewrote every line of the table (35 or 36 lines on each side, the change log among them).
- **`package.json`, 18.** The web app's browser tests were one line, `test:web:browser`, that every step with a browser test edited. Two such lanes always collided.
- **`packages/site/src/messages/en.ts`, 12.** About 2,000 lines, one object; new keys were added at the end of their group, so two steps of one area added at the same place.
- **The registries,** each a few times: the made-up stand-in's ports and games (`stand-in-ports.ts` 10, `stand-in-games.ts` 7, the former `stand-in-tracker.ts` 4), `scripts/check-web-shell.mjs` 6, the two-league harness's cases 6, `apps/web/src/server/ports.ts` 5, the role matrix 5, core's `commands.ts` 4. Entries added at the end of a list.

## What

- **The browser tests are the files themselves.** `npm run test:web:browser` runs `scripts/run-web-browser-tests.mjs`, which runs every `tests/browser/<name>-test.mjs` (helpers there do not end in `-test.mjs`): `web-exit-test.mjs` first, which builds the app, then the rest in alphabetical order with `--no-build`, stopping at the first that fails with that test's own exit code. The order is sound because every test builds the same way and none needs another before or after it: each starts its own server on its own port, on a made-up world it makes fresh in memory, and none writes a file another reads (`scripts/web-browser-chain.mjs` says so, and is where an order of its own would be written). A test that needs extra arguments in the chain writes them in its own file (`// In the browser chain: …`). Before each test the runner prints the line bash's trace printed (`+ node tests/browser/<file>.mjs --no-build`), so the notes on GitHub (step 2.178) still name the test that stopped; `.github/workflows/ci.yml` is unchanged. A new browser test is its file and nothing else.
- **Lanes stop editing `DECISIONS.md`**, as they already do not edit `docs/build`. No check reads the file (the structure check, the tests, the dashboard and the gate do not), so a lane that names a new ID passes all its checks without the row. A lane writes its rows in `docs/specs/v1/decisions-pending/<ID>.md`, one file per decision, under the headings of the tables they belong in; `npm test` folds them into a copy of the file, so a wrong heading or cell count fails in the lane. The lead runs `node scripts/fold-pending-decisions.mjs` in the landing commit: each row goes in its ID's place in the full list's tables (replacing a row with the same ID) or at the end of the change log and of "Decided for you", the file is formatted as the format check does, and the pending files are removed. The spec file the decision changes is still corrected in the lane, so the spec and its decision land together (T-185). Statuses are copied as written: only the founder's words make a row "Agreed".
- **The tables stay padded.** `DECISIONS.md` is checked by Prettier (`.prettierignore` does not exclude it) and stays so: the padding is what makes the file readable as text. Re-padding now happens only in the lead's landing commit, where it collides with nothing.
- **The messages are split by area.** `packages/site/src/messages/en.ts` joins fifteen files in `packages/site/src/messages/en/`, each under 300 lines, with keys in alphabetical order; `en`, `MessageKey`, every key and every text are unchanged (proved at the split against a snapshot of the old object), and every importer uses the same export. `en.ts` says which file a key's start goes in.
- **The registries:** entries in alphabetical or ID order, with a comment at the top saying a new entry goes in its place and never at the end; core's `commands.ts` sorted; the harness's case files gathered in alphabetical order. The runbook's rule (section 3) already says so.

## Considered

- **A list file of browser tests, one a line in alphabetical order.** Two lanes whose new tests fall between the same two lines would still collide, and the list can disagree with the folder. The files themselves cannot.
- **Keeping `DECISIONS.md` out of Prettier and writing rows unpadded.** Fewer whole-table conflicts, but rows added at the same end would still collide, and the founder reads the file as text, where unpadded tables are hard to read.
- **One file per decision for good, with `DECISIONS.md` built from them.** No collisions at all, but the founder's one list would become a generated file and every reference to it would change; folding at landing gives the same lanes without that.
- **Splitting the role matrix and the web shell check into a file per area.** Their rows lean on helpers in the same file, so a split is not mechanical; ordering is enough for the collisions seen.

## Revisit if

- Landing merges still collide often in a file this step left whole (the role matrix, the stand-in's ports): then that file is split by area too.
- A browser test comes to need another test's state: the chain's order is then written in `scripts/web-browser-chain.mjs`, in words.
- The lanes stop being merged with the build branch before landing, or a check starts reading `DECISIONS.md` (it must then read the pending files too).
