# 039 — The tracker's endpoints and publishing plays

Date: 2026-11-14. Step 2.32; serves T6 §3, §5 and §6, T-25, T-26, T-87, T-117 to T-120, T-229. Decided by the lead (technical). T-251.

## Problem

Steps 2.28 and 2.29 built the scoring-session commands and the command that applies the tracker's taps; step 2.31 built the live publisher and the local hub; step 2.6 wrote the shapes. Left open: the addresses and bodies of the session requests (the contract named the game in the body, the commands also need the device, and the holder came back as an account), how each command's answer becomes HTTP, what a snapshot shows and to whom, how many live messages a batch gives and in what order, and where the local hub is mounted.

## What

- **Four addresses**, each a thin handler that takes who and which league from `server/context.ts` (T-23) and runs one command or query (T-25):
  - `POST /api/v1/leagues/{leagueId}/games/{game}/commands`: `games.apply_tracker_commands`.
  - `POST /api/v1/leagues/{leagueId}/games/{game}/session`: the contract's `SessionRequest`, one of open, renew, take over or release, each running its own command. One address, because the contract is one shape.
  - `GET /api/v1/leagues/{leagueId}/games/{game}/snapshot`: `readGameSnapshot`.
  - `GET /api/v1/live?channel=…`: the local hub's page-facing door (below).
- **The address must be exactly the one the address helper builds** (`leagueApiUrl`, T-34) from the league the context found and the route's parts; otherwise "not found". The game comes from the address only: a game named in a commands body is put aside, and a session request may not name one.
- **The session request names the device, not the game** (`packages/contracts`, `SessionRequest`): open and take over carry `deviceId`; renew and release carry `sessionId`. A refusal may now say `game-not-live` (decided, cancelled or postponed). Another scorekeeper is shown the holder's name (`displayNameOf`), never the account id.
- **Answers as HTTP**, as the tracker's queue reads them (record 024):

  | Answer                                                                      | Commands                     | Session                    |
  | --------------------------------------------------------------------------- | ---------------------------- | -------------------------- |
  | Every command answered (accepted, duplicate, refused, session not held too) | 200 with the reply           |                            |
  | Held by you, held by another, ended                                         |                              | 200                        |
  | Not a batch or not a session request                                        | 400 `invalid-input`          | 400 `invalid-input`        |
  | A protocol version not taken (T-127)                                        | 400 with the version refusal |                            |
  | No session cookie, or one that ended                                        | 401 `signed-out`             | 401 `signed-out`           |
  | May not score this game                                                     | 403 `not-allowed`            | 403 refused, not-allowed   |
  | No such league or game here, another league's game included                 | 404 `not-found`              | 404 refused, unknown-game  |
  | The game cannot be scored now                                               | 200, each command refused    | 409 refused, game-not-live |

  A batch whose every command is refused `unknown-game` is answered 404 as a whole: the address names nothing.

- **Publishing after the answer.** Once a batch with at least one accepted command is saved, the route publishes with Next.js's `after`, so the tracker never waits on the live service. The message is cut from the game's snapshot read as a visitor (`publicViewer`), the strictest view anyone has, so names and numbers are only those the league and each team show everyone (T-81, T-87, S-22). The score then goes on the league's live-scores channel. A message that fails is reported by its reason and dropped; viewers recover from the gap (T-118).
- **One message per saved batch**, with the batch's last sequence number. A batch of several taps (a queue replayed after a dropped connection) is a jump in numbers, which a viewer answers by fetching a snapshot, so it shows the truth rather than a run of messages built from states the server never kept.
- **Order.** In one server process, one game's messages go out one after another, and never one older than the last sent: two batches saved close together may read the same newest state, and the second is not sent twice. Across server processes order is not promised; a viewer's gap rule covers it.
- **The latest play names nobody unless both teams' player lines are shown to visitors**, as the contract's `LatestPlay` says: one channel carries it to everyone.
- **The snapshot is the visitor's view for everyone** and leaves a hidden team's players out entirely (no ids, no names, no numbers). A live or archived league's snapshot is sent `public, max-age=0, s-maxage=2`, so the cache in front of the site holds it for 2 seconds (T-119). A draft or suspended league's is `private, no-store`, and it is "not found" to anyone who may not open the league (`mayOpenLeague`, U-9). A signed-in viewer allowed more gets it on the game page (`readGamePage`), not here.
- **The local hub is mounted at `GET /api/v1/live`**, the address the schedule pages already listen on (step 2.42). Its `authorize` is the league pages' rule: the channel's league must exist, not be in the bin, and be one the person behind the request's session cookie may open (`mayOpenLeague`); a cookie that no longer identifies anyone listens as a visitor. One hub per server process, made with the web ports (which `container.ts` keeps on `globalThis`), shared by the publisher and the door. Where pages listen to Supabase Realtime, the door is absent (`liveFeed: null`).
- **Stand-in only.** The endpoints run on the web app's made-up stand-in (`stand-in-games.ts`, `stand-in-tracker.ts`): made-up rosters (one team showing its numbers to staff only), in-memory sessions, states, events and lines, one transaction at a time. The database-backed ports come with the web app's start on a database.

## Considered

- **Four session addresses** (`/session/open`, `/renew`…). Each would still run one command, but the contract already has one shape with a `type`, and the tracker sends them the same way.
- **A message per accepted command.** Truer to "one per tap", but the server keeps only the state after the batch; rebuilding each in-between state would mean replaying the engine once more per tap for messages a replayed queue's viewers would barely see.
- **The snapshot drawn for each viewer.** Richer for staff, but then it could not be cached, and a page recovering from a gap would see different players than its live messages imply.
- **Answering "no such game" with 200 and refused commands.** Correct by the protocol, but the queue would mark every tap refused for an address that names nothing; 404 halts it instead, as for another league.

## Revisit if

- The tracker route (step 2.33) or controller (2.34) needs the engine's full state and rosters to reload after a refusal (T-113): that is a staff read of its own, not this public snapshot.
- Several server processes publish one game (the web app on more than one machine): order then rests on viewers' gap rule alone.
- The founder wants an open team's names shown in the latest play while the other team is hidden: change `latestNamed` in `read-game-snapshot.ts` and the contract's note on `LatestPlay`.
