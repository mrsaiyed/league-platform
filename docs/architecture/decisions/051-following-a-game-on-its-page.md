# 051 — Following a game on its page

Date: 2026-11-14. Step 2.45; serves P7 §5.3, T6 §6, T-117 to T-121, S-7. Decided by the lead (technical). T-255.

## Problem

T-118 says a page that notices a gap fetches a snapshot, and T-119 that a page that cannot make the live connection re-fetches it every 5 seconds. That leaves four cases where the page would show something wrong for as long as nothing else happens: messages sent between the page being drawn and its live connection opening; a lost last message, which no later message reveals; the players, which messages do not carry (only the score, period, clock, team fouls and latest play); and a snapshot that is itself a cached copy older than what the page has seen. It also left open how the device lines its clock up with the server's (T-121) when a snapshot may be up to 2 seconds old.

## What

- **The page arrives drawn** from the game's snapshot and the game page (`readGameSnapshot`, `readGamePage`), both read as a visitor, so it is the same for everyone and a hidden team's players never reach it (T-87, S-22). Its live part (`apps/web/src/features/live-game/live-game-view.tsx`) then follows the game with `followGame` (`follow-game.ts`), which applies step 2.6's rules (`viewer-state.ts`) and decides when to fetch a snapshot. One fetch at a time.
- **When a snapshot is fetched:**
  - at once, on a gap in the numbers (T-118);
  - at once, each time the live connection opens, because messages may have been missed while it was connecting or lost;
  - every 5 seconds while the live connection is not open (T-119), silently;
  - again 2 seconds after a snapshot that is behind messages already seen (the snapshot address is cached for 2 seconds);
  - at most every 5 seconds while the players shown are older than the score;
  - every 30 seconds while a live game is open and quiet, so a lost last message is found.
- **A final game is not followed**: a page that arrives on one opens no live connection, and a page whose game becomes final closes its connection.
- **The clock** (T-121) is lined up by the page's own snapshot and by each message, whose `sentAt` is fresh. A fetched snapshot never moves it, since it may be a cached copy up to 2 seconds old. Until the page runs on the device, the server and the device's first drawing show the clock as it stood when the snapshot was read.
- **The play-by-play** is the one the page arrived with, newest first, with a link to load newer plays while the game is live: messages carry only the latest play, and that play repeats or goes back after clock taps and undos, so it cannot be appended safely. The latest play is shown live above it.
- **Corrected games** show "Corrected on" and the date (S-7), from the snapshot's `correctedOn`, never the reason.
- The page listens on the local hub (`/api/v1/live`) as the schedule pages do; where that address is absent the connection is refused and the page polls.

## Considered

- **Only T-118 and T-119.** Simplest, but a page drawn a moment before a play, or one that lost the last message of a quiet spell, would show a wrong score until the next play, possibly for minutes.
- **Re-fetch the players after every message.** Players would be current within a second, but every viewer would fetch once per play, several times the polling load T-119 budgets for; at most one per 5 seconds keeps it to the same rate as a blocked page.
- **Building the play-by-play from messages.** Cheap, but wrong after undos and clock taps, and incomplete after a gap.
- **Redrawing the server part of the page after each play** (`router.refresh`). Always complete, but every viewer would cost a full page read per play, with nothing cached.

## Revisit if

- The play-by-play must update live (P7 §5.3): give the snapshot or a cached read of its own the recent plays, as the visitor sees them.
- The polling load is measured in staging (F-5) and the 5-second or 30-second rates prove too costly or too slow.
- Pages listen to Supabase Realtime: the page then needs that subscriber and the project's address, as the schedule pages will.
