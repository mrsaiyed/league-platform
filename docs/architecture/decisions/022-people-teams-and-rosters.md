# 022 — People, teams and rosters in the database

Date: 2026-11-13. Step 2.2; serves T3 §3, §5, §7 and §12, R-3, R-17, S-22 and T-40 to T-47, T-52. Decided by the lead (technical). T-234.

## Problem

T3 lists the columns of `people`, `teams` and `roster_entries` and says the database keeps jersey numbers unique in a team "where the league requires it". It does not say where that switch lives as a real column (T-44), how the database checks it, what "on the team" means for it, whether names may be empty after erasure (T-52), whether roster entries go to the bin, or how a coach or captain grant points at a real team. Migration 0008 needed answers.

## What

- **The unique-jersey switch is one value, read two ways.** It is part of the season's rules document (`rules.rosters.uniqueJerseys`, step 2.5), which the season commands set (step 2.15). `seasons.unique_jerseys` is a generated column worked out from it, so the database has a real column to enforce (T-44) and the two can never disagree. Anything other than JSON `true` is off. If a later rules version moves the field, the migration that brings that version changes the expression.
- **How it is enforced.** A trigger on `roster_entries` refuses a number already worn on the team while the season's switch is on (`roster_entries_unique_jersey`), and a trigger on `seasons` refuses switching it on while a team already has a number worn twice (`seasons_unique_jerseys_clash`). Both take one lock per season before they look, so two writes at once are checked one after the other. That relies on READ COMMITTED, the default, where the look after the lock sees what another transaction committed meanwhile; under REPEATABLE READ those writes are refused (as for division parents in migration 0007); SERIALIZABLE is fine. 0 and 00 are different numbers, as in the tracker.
- **"On the team" means no `left_on` date.** A player who left frees their number; rejoining (clearing `left_on`) is checked again. A person is on a team at most once at a time (`roster_entries_once`).
- **Roster entries are not binned.** Leaving sets `left_on` and the entry stays in the team's history (R-17, T-52); an entry made by mistake is removed. An entry's team and person never change: moving a player is leaving one team and joining another, so the history stays true.
- **People may have empty names.** Erasure (T-52) empties the name, contact details, birth date and profile link in place, so the row, its id and its statistics stay (T-220). The people commands (step 2.17) ask for a name when an admin adds someone; the name function already answers "no name" for an empty one. `is_minor` is empty when the league does not know. `visibility` holds the person's own request as the name function reads it: `none`, `initials` or `removed` (R-15, R-17, T-81). A profile is linked to at most one person in a league while not in the bin; a person is never merged into themselves, and only into a person of the same league.
- **Teams.** A team's division is optional and must be of the team's season. Its short name and its name (whatever the capitals) are unique in its season while not in the bin, because addresses (T-34) and the fixture import and Al-Hadi transfer (steps 2.10, 2.58) find teams by them. `stats_visibility` takes S-22's four levels (`everyone`, `members`, `team`, `staff`) and has no default, because the league sets the starting level (step 2.14) and the command that makes a team chooses; the name function shows only team totals for the two levels stage 4 brings. `lineage_id` is a plain id with no table of its own: a new team gets a fresh one, a team carried over gets the old one, and a season holds at most one team per lineage. A team never moves to another season.
- **Coach and captain grants point at a real team.** As for programs (0004), `role_grants` and `invitations` gain a generated `scope_team_id` with a foreign key on `(league_id, scope_team_id)`, and the team scope is no longer refused. Club scopes stay refused until the clubs table exists. The access commands still refuse a team scope (`scope-not-available`) until a step gives them a check that the team exists; opening it there is that step's work.
- **Not built yet:** `people.photo` and `teams.logo` wait for the `assets` table (stage 3), as `seasons.logo` does; `teams.club_id` waits for `clubs`.

## Considered

- **A plain `unique_jerseys` column set by the season commands beside the rules document.** Two places for one switch, which a bug could set differently; the generated column cannot drift.
- **Moving the switch out of the rules document into its own column only.** That would change the rules contract of step 2.5, which the season settings screen and the rule-change preview (S-1) read whole.
- **A unique index instead of a trigger.** An index cannot look at another table's switch. Copying the switch onto every roster entry would need a trigger anyway, and many rows rewritten each time the switch moves.
- **A bin for roster entries.** Leaving already keeps history, and nothing points at a roster entry (statistics point at the person and team), so removing a mistaken entry loses nothing.

## Revisit if

A league needs jersey numbers outside 0 to 99, a player must hold two roles on one team at once, or a roster entry gains something that points at it (then it needs the bin).
