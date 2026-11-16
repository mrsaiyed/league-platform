# Lane 2.153 — "Score this game" where a scorer looks for it: handover

Branch `lane/2.153-score-this-game`. Written 2026-11-16 for a builder who has only GitHub.
Step 2.153's line is in `docs/build/STAGE-2.md`. This round closed the independent review's
points 1 to 5 and built the lead's decision S-70. Everything below is committed and pushed.

## The review's points and S-70

| Point                                                        | State | Commit(s)                                      |
| ------------------------------------------------------------ | ----- | ---------------------------------------------- |
| 1 (High) the scoring read runs the league gate               | DONE  | 8a979c0a                                       |
| 2 (Medium) on the database, no 500 for a signed-in page view | DONE  | 9803dce4                                       |
| 3 (Medium) no button after sign-out (Back, the league link)  | DONE  | e541d480                                       |
| 4 / S-70 the button from the start of the game's own day     | DONE  | bf4df78f (code, tests, P7 §5.1, P4)            |
| 5a every answer private, never kept                          | DONE  | 6f34bfe8                                       |
| 5b one maker of a game's anchor, no page code in the server  | DONE  | 98fd569a                                       |
| 5c the spoken name, "Score this game: Bears against Hawks"   | DONE  | a2fb3ef1                                       |
| 5d another league's scorekeeper in the browser test          | DONE  | ed3a722f                                       |
| 5e the missing space in package.json                         | DONE  | eb28c0df (then replaced by the merge's runner) |
| 5f the place line at one height across a row of cards        | DONE  | f9a2dfd2                                       |
| Browser test made sound on a game day at noon                | DONE  | e80dd597                                       |
| Pictures: the assigned scorekeeper's schedule                | DONE  | f01e88a7                                       |

- The catch-up merge with `build/stage-1` is DONE: 27cd4cc5 (step 2.188's shapes: the
  browser runner, the split messages, the ordered registries), then 59d69df2 (the three
  tools). Merge base before them: 383149e8.
- `docs/specs/v1/decisions-pending/S-70.md` is WRITTEN (c0d0e0a5), in the README's form;
  `node scripts/fold-pending-decisions.mjs --check` printed: added S-70 to "P7 — Teams,
  schedule and game day" (none → Decided for you) and to "Decided for you, waiting for your
  yes". The lead folds it at landing.

## Checks run on this computer (after the last change)

- `npm run check`, `npm run typecheck`, `npm run format:check`: passed.
- Unit files by name: 17 files, 394 tests passed (core's list-scoring-offers and
  league-url, commands, the endpoint, database ports, the page's reader, games area,
  game pieces, the database games lists, the role matrix, two-league isolation, the
  messages); earlier in the round the isolation folder and role matrix (11 files, 560
  tests) and the games area and schedule grid folders (20 files, 98 tests).
- `node --test tests/pending-decisions.test.mjs`: 11 passed. `node scripts/check-lane-messages.mjs 383149e8`:
  3 keys, nothing missing.
- `tests/browser/score-this-game-test.mjs` (alone, through `scripts/heavy.mjs`): 105 checks
  passed after e80dd597.
- Pictures, world at noon (LOCAL_NOW=2026-11-16T18:00:00.000Z), in `.local/shots` (not in
  git): 390 and 1280 `north-valley-scorekeeper-home.jpg`, `north-valley-scorekeeper-schedule.jpg`,
  `quiet-pines-scorekeeper-schedule-assigned.jpg`. Retake them with
  `LOCAL_NOW=<noon from worldAtNoon> node scripts/shots.mjs --only=scorekeeper-home,scorekeeper-schedule`.
- NOT run here (by the computer's rules): `npm test`, `npm run test:web`, the other
  browser tests (games area, after midnight, public pages). GitHub runs them.

## Left before landing

- GitHub has to pass the newest commit twice (`node scripts/push-lane.mjs --times=2`, then
  `node scripts/wait-for-github.mjs lane/2.153-score-this-game lane/2.153-again`); at the
  time of writing f01e88a7 was still being checked.
- The area 5 lead's review of these fixes; the lead's look at the game-day pictures.
- At landing the lead folds S-70.md into DECISIONS.md.

## What the code does not say

- Other league API routes and where their gate runs: `games/[game]/snapshot` runs
  `mayOpenLeague` in game-snapshot-endpoint.ts; `scoring` now does in
  scoring-offers-endpoint.ts. The tracker's six (`commands`, `not-started`, `reopen` GET and
  POST, `rosters`, `session`, `state`) do NOT: they answer 401 to a visitor and 403 to a
  signed-in non-scorer of a draft or suspended league, against 404 for a league that is not
  there, so they tell that a hidden league exists. Reported to the lead, not fixed (not this
  lane's).
- The day rule reads the league's today and each game's day from the store (the database's
  clock and `leagues.time_zone`; core's `dayIn` on the stand-in), the same days the Games
  list reads, so "Enter the score" always lands on a game the list shows. No second notion
  of "the league's day" was written.
- The page's reader is shared by one view's lists and dropped when the last list unmounts
  (React runs every unmount before the next page's mounts), so Back or a sign-out gives a
  fresh read. Keying by the session was not possible: the page's script cannot see it.
- The 404 of the scoring read keeps the snapshot's `Cache-Control: no-store` (not
  `private`): the two public reads must answer a hidden league identically.
- The endpoint still imports `type ScoringOfferReply` from the schedule pages' index: a type
  only, erased when built, so no page code reaches the route.
