# 070 — The web app on the database, part 3: the statistics, the team pages and each league's name

Date: 2026-11-15. Step 2.93 part 3 (T-274); follows records 055 and 069. Serves T2 §4, T-81, T-30. Decided by the builder of step 2.93 part 3 for the lead, to be confirmed when the part lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up database (PGlite) only.

## Problem

On the database the statistics page, the team pages and the home page's leaders refused (record 069), and every league's header showed its short name, since the name and design came from the stand-in's made-up leagues only. These pages show people's names, children's among them, so who sees which name must be read from the league itself (step 2.126's settings, its own audience) and never from a fixed value.

## What

- **Names only with the league's own settings, in one transaction** (T-81). `publicStats.statisticsOf(leagueId, work)` is new on the port: on the database it opens one transaction set to the league and gives `work` the statistics reads and the league's settings, read in that transaction: its audience (`findLeagueAudience`) and its name policy (core's `readNamePolicy` over `listSettingValues`). So a name is always shown by the setting saved when it was read, never by one read a moment before or after. The statistics page, the home page's leaders and a team's page (its head and statistics) read through it. On the database the read store alone (`readStoreOf`) does not read people: it refuses with `NamesOnlyWithSettings`, so no page can put a name beside settings read at another moment. The stand-in answers `statisticsOf` from its one world.
- **A roster reads the league's settings itself.** `publicTeams.rosterOf(leagueId, teamId, viewer)` takes the viewer only (it took a policy from the caller); on the database it reads the policy in the same transaction as `listPublicRoster`, which reads the audience from the league's row; on the stand-in it reads its made-up league's own setting. No caller hands a roster a policy any more.
- **Every rule stays in core**: who is left out (a person in the bin, a team in the bin, a season not public, a team whose statistics are "team totals only" or staff only, a player on such a team, a person taken off at their request) and how a name is shortened (`statisticsSource`, `showName`, `publicRosterLine`). The queries only fetch named columns: `listPeopleForDisplay` reads names, `is_minor` and the person's request, never a birth date, a contact address, a guardian or a note.
- **A member's teams** for a "my team" league: `listTeamsOfAccount` (new) reads, in a transaction set to the league and the session's account, the season's teams the account has a roster place on now, through the person linked to its own profile (`relation = 'self'`, as the made-up world's person is an account), team ids only. Nothing yet links a seed person to an account (claiming comes later), so on the made-up database a member is sent to a team they coach or captain (their grants), or stays on the league home.
- **Each league's name** (`leagueSites`, new on the ports): on the database the name the owner gave the league (`findLeagueName`, new: the name and nothing else of the row); on the stand-in its made-up leagues', with LOCAL_DESIGN as before. **The database holds no design**: T3's `sites` and `site_releases` are not yet migrated, so every league on the database takes the neutral starting design (`clean-court`). Storing a design needs a migration; this part has none.
- **A season's statistics**: no command writes `seasons.stat_keys`, so on the database every season named none. Core now reads a season that names none as keeping what its rules' "Statistics kept" asks for (P7 §1): the columns the box score grid asks for, the rules read as the games module reads them (rules that cannot be read are the starting set). A season that names its statistics keeps those (the stand-in's do).
- **Minimum games for leaders**: no league setting holds one, so on the database there is none (0). The made-up world's leagues keep their own. A question for the founder (below).
- **The seed**: each seed league says who plays (Maple Street is now a youth league), its people carry made-up private fields for the scans, and `madeUpDatabase({ underWay: true })` puts the league's people on the teams that played and records each played game from its box score sheet (`setBoxScore`), by the product's own commands.
- **The T-81 scan through the database-backed ports** (`database-names-scan.test.ts`): the adult and the youth seed league, under every names setting the owner saves, with and without the parents' confirmation and with a player taken off; every page's data and the rendered statistics page hold the names the rules give and no withheld name or private value.

## Considered

- **Passing the policy into the roster, as before.** The caller read it in another transaction; a setting saved between the two reads would show names by a setting that was no longer the league's.
- **Leaving `readStoreOf` able to read people on the database.** Every page reads through `statisticsOf` now; a refusal makes a page that does not fail loudly, not show names by a stale setting.
- **A design kept as a league setting** (`setting_values`). T3 puts the design in `sites` and `site_releases`; a second place would have to be moved later. Left for the step that migrates them.
- **Writing `stat_keys` in the seed by hand.** Seasons the product makes would still keep none.

## Revisit if

- The design editor's tables arrive: `databaseLeagueSites` reads the league's published design.
- A league setting for the leaders' minimum games is decided: `settingsOf` reads it.
- Claiming or registration links people to accounts, and a guardian's account should start on their child's team (`listTeamsOfAccount` reads `self` only).
- A command writes `stat_keys`: the rules' set is then only for seasons that name none.
