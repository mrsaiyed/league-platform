# 102 — Who may be assigned to score

Date: 2026-11-23. Step 2.56, part 2 (T-305). Serves P4 §3 ("Games: assign scorekeepers"), P7 §5.1, T-74, T-75.

## Problem

The assign and unassign commands existed, but nothing listed a game's assigned scorekeepers or the people who may be assigned. The games store had no list of a game's assignments, and the games commands' access reader lists no grants: it answers only "what does this one account hold".

## What

- **`games.list_scorekeepers`** (`packages/core/src/modules/games/commands/list-scorekeepers.ts`): for a season, its games still to be decided (not final, forfeit or cancelled), not in the bin, soonest first, each with the accounts assigned in the order they were; the people who may be assigned, by the same rule `assignScorekeeper` checks (`allows(holder, 'games.score', season's program)`: the owner, then every account with a grant in force that scores there); beside each, whether they score every game anyway (the owner, an admin, a scheduler, or every scorekeeper in a league whose setting is "any scorekeeper"); and the league's setting. Permission `games.manage` at the season's program, in any state of the league, as taking someone off must always work.
- **`ScorekeepersTx`** is the games transaction whose access also offers `listGrants`. Only this read asks for it: the database's transaction is the access store already, and the made-up world is handed its grants list apart (`listGrantsOf`), so the many tests that build a world with a narrow reader are unchanged.
- **`GamesStore.listSeasonAssignments(seasonId)`**: one read of the season's open games and their rows of `game_assignments`, both kept to the league (an isolation case of its own, and one for the command).
- Names come apart, from the same read the games list uses for its "Scorekeeper:" line (`namesOf`, through `access_list_names`), now also giving every staff name by account.

## Not done

- No list across seasons: the screen shows one season at a time, as Standings and stats does.
