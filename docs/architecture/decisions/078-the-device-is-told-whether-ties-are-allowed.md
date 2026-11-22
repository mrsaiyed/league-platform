# 078 — The scorekeeper's device is told whether ties are allowed

Date: 2026-11-17. Step 2.37, part 1 (T-282). Serves S-73 (decided for you) and checklist J3 of the audit of scoring a game live. Decided by the lead; built by the design lead of step 2.37.

## Problem

End game is a tap like any other: the device applies it at once, keeps it and sends it, also with no connection (T-114). The engine ends a game at any score. Whether a level score may end it is the league's rule (`allowTies` in the season's rules), which only the server knew: it refused the End tap, and the device then rebuilt the game without it. So at a level score in a season with no ties the device showed a final game for a moment, and with no signal for as long as the signal was gone, and then took it back. A scorekeeper told "Final" packs up.

## What

- **The rosters the device is given say whether a level score may end the game.** `games.read_tracker_rosters` (core) returns `allowTies`, read from the rules the game is played under (`effectiveRulesOf`: the game's own rules if it has them, else its season's), which is where the End tap itself is judged from (`games.apply_tracker_commands`, `games.end_tracked_game`). The contract's `TrackerRosters` carries it as a required field, `trackerRostersReply` passes it on, and the device keeps it with its rosters (`DeviceRosters.allowTies`). Both stores answer through the same core read, so the database side needed no change.
- **The device refuses by it, and nothing is asked.** At a level score with `allowTies` false, End game opens no question: the scoring pad says the score, that the season allows no ties, and to play overtime. With `allowTies` true the question says the game ends as a tie. This works with no connection, since the fact arrived with the page.
- **The server stays the judge.** The End tap is still refused by the server at a level score its rules do not allow. The device handles that calmly: the controller rebuilds the game without the tap (live again), the scoring screen says in the pad that the league did not take End game and why, and drops that tap from the list of taps not applied, so no notice grows for it. This is the case of a page opened before the rule was changed.
- **Why with the rosters and not with the engine's state.** The state read (`TrackerGameState`) is a strict shape read by pages that may be older than the server; a field added there would make an older page refuse the state. The rosters come to the device as the page's own properties, drawn by the same release as the page, so an older page never meets a field it does not know. It is also where the season's other rule for the table already travels (`uniqueJerseys`, record 058).

## Considered

- **Leaving the device not knowing, and wording the question for both cases** ("if this season allows no ties the game stays live"). The first design lead's stopgap. The screen would still show a final game with no signal, which is the harm.
- **Putting the rule into the engine's rules** (`basketball.Rules`), so the engine itself refuses. The engine is shared with the Al-Hadi tracker, whose behavior does not change (T-16), and a tie rule is the league's, not the sport's.
- **Sending the whole season's rules to the device.** More than the device needs, and every later rule would be one more thing an older page may misread.

## Revisit if

- **A device starts refreshing its rosters from the rosters address** (`GET …/games/{game}/rosters`, step 2.118). That reply is the same strict shape, and a page older than the server would then meet any field added after it was opened. Before then the reply needs a reading shape that leaves out what it does not know, as the viewer's snapshot has (record 058), or the address answers by protocol version.
- The rule can change while a game is open and it matters more than a calm refusal: the device would then need to be told again, with the session's renewal.
- A second sport comes whose games may end level by its own rules.
