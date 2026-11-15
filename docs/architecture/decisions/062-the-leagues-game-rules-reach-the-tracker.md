# 062 — The league's game rules reach the tracker: the engine's rules, and the platform's command shape in protocol version 2

Date: 2026-11-15. Step 2.122 (part A; the first half of step 2.68); answers the 2.107 audit's finding M7; serves P7 §1 and §5.2, S-1, S-21, S-32, T6 §1 and §3, T-127, T-128. Decided by the builder of step 2.122 for the lead (technical). T-265.

## Problem

The engine has known the clock mode's switch, the last-minutes stop clock, the mercy lead and the personal foul limit since step 2.67, but none of it reached a game on the platform. The function that turns a season's rules into the engine's (`engineRulesOf`, `packages/core/src/modules/games/engine-rules.ts`) dropped the three rules, so a league with a foul limit of four saw nobody marked out, and the tracker's door read taps in the Al-Hadi tracker's command shape (`Envelope`), which has no clock-mode switch, so the switch step 2.69 will draw would have been turned away. The Al-Hadi tracker dims a player at five fouls today: at the demo the rebuilt tracker would have done less than the one it replaces.

## What

**The rules.** `engineRulesOf` carries `playerFoulLimit`, `mercyLead`, `stopClockLastSeconds` and, with the last, `stopClockScope`, each only when the season sets it, and leaves it out when it is off (never `null`). That is how the engine keeps rules itself (`checkRules` in `packages/sports`), so the rules the server makes a game with are the very rules the engine would keep, and a season with none of them gives the same rules as before this step. Team fouls that reset by half or by game are still not carried: the engine has no such setting (finding M8, an engine step).

**One path to the device, so device and server cannot disagree.** The device never builds rules of its own: it loads the engine's state from the server (`games.read_tracker_state`, record 049), whose `rules` are those the next batch will be judged by, and applies its taps on that state with the same engine. The read and the batch both take the game's rules from one place (`effectiveRulesOf`, then `engineRulesOf`), and a state that holds only line-ups takes the game's rules as they stand in both (`withCurrentRules`). So the foul a device shows as the fourth is the fourth on the server, and a reload gets the same state. Nothing was added to the opened-game read or the page: the state the device already loads carries the rules.

**A game keeps the rules it started with (S-1).** Unchanged, and now tested for these rules: from the moment a game goes live its state keeps its rules and the game's `format` is fixed (record 049, `games_format_fixed_once_started`), so a season's limit changed mid-game or after the game ended reaches neither the server's state nor a device that reloads. A game started before this step has rules without a limit and keeps them: it plays on as before, though its fixed `format` says five. A game with only line-ups still takes a change.

**The command shape: the platform's, in protocol version 2.** A tap (`TrackerCommand` in `packages/contracts/src/tracker-protocol.ts`) is now `PlatformEnvelope` with its tap time: the Al-Hadi commands, the clock-mode switch, and a `rules` command in the platform's shape (still refused at the door: the rules come from the league). The protocol stays at version 2:

- Everything the present tracker sends is taken and answered exactly as before: the version 2 shape only got wider. Version 1 keeps the Al-Hadi shape as it was (`TrackerCommandV1`, `CommandBatchV1`), so a version 1 batch is read as it always was; nobody ever sent it a switch.
- A tracker opened before this release (an older client, the T-127 case) sends what it always sent, and reads states that may hold `clock-mode` plays and the new rules; its engine has known both since step 2.67 (the state's schema leaves the rules' other fields to the engine). A player marked out is a field it already reads (`Line.fouledOut`).
- Moving to version 3 would have dropped version 1 (the server takes the current version and the one before, T-127) for no gain: nothing an older client sends changed meaning.
- A newer client meeting an older server (only on a release taken back) would send a switch the older server cannot read: the batch is answered `invalid-input`, the queue sends its taps one at a time, and only the switch is set aside as not saved (record 024). Under a version 3 the older server would have turned the whole queue away until the page updated, which is worse at a game.

The engine's events keep the switch like any play (`game_events`, type `clock-mode`, payload `{ mode }`), it is undone like any play, and the public pages read it as an "other" play.

**The Al-Hadi transfer still reads that tracker's shape.** The transfer checks each stored action of an Al-Hadi backup against the Al-Hadi tracker's own command shape (`tracker-replay.ts`), now named `TrackerCommandV1`, so a backup holding a clock-mode switch is not taken as that tracker's. The transfer replays through the door with the season's rules, as before: if the Al-Hadi season here sets a mercy lead or a last-minutes stop clock, a replayed game can meet the engine's "the clock is already running" and is then blocked in the plan, never written wrong.

**What a player marked out means.** S-32 settles it: marked only, never taken off or kept off the floor; a foul for them is still recorded, and taking one back unmarks them. The mark is drawn by step 2.35 (checklist D10); what the public page says about it is not decided here.

## Considered

- **A separate read of the rules for the device**, beside the state: two paths that could drift apart, one of which a device offline would not have. Refused.
- **Carrying `null` for a rule that is off.** The engine drops `null`, so a state the server made would differ from the same rules sent through the engine's own `rules` command, and every existing game's rules would change shape. Refused.
- **Protocol version 3.** See above: it would drop version 1 and make a release taken back worse.

## Revisit if

- The format confirmed on the device (record 054) lists every rule (step 2.119, S-39): it compares only periods, their length, overtime and the clock mode today, so a limit changed after a scorekeeper confirmed, before tip-off, reaches the game without being shown again.
- The engine learns when team fouls reset (finding M8): carry `fouls.teamFoulsReset` here.
- A command is added whose meaning an older server would get wrong rather than refuse: that needs a version of its own.

## Checks

Contract: `tracker-protocol.test.ts` (version 2 takes the switch and stays 2; every tap of the present tracker in versions 1 and 2; version 1 refuses the switch). Core: `engine-rules.test.ts` (each rule carried, each left out when off, the same rules the engine keeps), `commands/season-rules-reach-engine.test.ts` (a limit of four marks a player out at four in the saved state and the one a device loads, marked only; no limit, no mark; S-1 mid-game, after the end, before tip-off, and a game started before this step; the mercy lead and the last-minutes stop clock each through the door; the switch taken, saved as a play and an event, undone; a switch to the mode in force refused by the engine alone; version 1 as before; a version 2 batch with a player added at the table as before). Web: `features/tracker/season-rules-on-device.test.ts` (the controller against the real endpoints: out at four on the device at once and on the server, the same lines; a device that reloads mid-game after the season changed keeps four; the switch taken by the endpoint and saved). Database: the two-league harness (the switch under a foul limit at the target's game, and the state read carrying the target's season's limit).
