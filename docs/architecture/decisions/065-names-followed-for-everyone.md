# 065 — Names followed for everyone: a starting value by who plays, and full names that are only ever stored confirmed

Date: 2026-11-15. Step 2.162; answers the 2.106 audit's finding H13; serves R-14, R-15, R-24, R-25, R-27, R-29, T4 §7 (T-81), T5 §6 (T-98), P4 §6. Extends record 056. Written by the step's builder for the lead (technical). T-268.

## Problem

Record 056 made "Names on public pages" act on children only (and on people of unknown age in youth and mixed leagues). In an adult league all three choices left every name in full while the screen said "The setting was saved." R-29 makes the choice followed for every player. Two things then break unless decided:

- The setting's one declared default, first name and last initial, would become every adult league's start, so every adult league's pages would change the moment this lands.
- "Full names" for a child needs the admin's confirmation (R-14), and the stored value could not say whether it was confirmed: the database keeps a setting as exactly `{version, value}` (0007, `setting_values_value_document`), so a flag beside the value would need a migration.

## What

**A declared setting may start where who plays in the league says.** A declaration may give `startsAs`, starting values by audience (`adult`, `youth`, `mixed`), each passing its schema; `default` stays the start of every other league and of a place whose league is not known. `privacy.publicNames` declares `startsAs: { adult: 'fullName' }`, so an adult league starts on full names and a youth or mixed league on first name and last initial. The start is worked out each time it is read (`startingValue`, `lookupSetting`'s new audience argument), never stored. The leagues store says who plays (`LeaguesStore.leagueAudience`, the existing query `findLeagueAudience`, an unknown audience read as youth); it is read only for a setting that has `startsAs`. The settings screen's list (`listLeagueSettings`), the protective order in a read-only league (R-26) and `getSetting` all use the league's own start.

**A stored "full names" is always a confirmed one.** A value the declaration asks to confirm is not asked where it is the league's own start (`confirmedValuesFor`): an adult league is never asked to confirm full names. `leagues.set_setting` given such a value without `confirmed: true`, at the league level, where it is the league's start, removes the league's stored value instead of storing one (it still checks the version, writes its activity entry, and answers `{ key, version: null }`). Anywhere else it is refused with `confirmation-needed`, as before. So the only way a stored `fullName` is written is with the confirmation, before this step and after it.

**The policy and the one function.** `NamePolicy` is now `{ names, childrenInFull, playersMayAskForInitials }`. `readNamePolicy(settings, audience)` gives `names` from the league's value or its start, and `childrenInFull` true only when the league's value is a stored `fullName`. `showName` applies `names` to every player; a child (and a person of unknown age in a youth or mixed league) is shown by first name and last initial at most unless `childrenInFull` is exactly true; a recorded request for initials takes effect but never shows more than the league's choice, for adults too (so recorded initials in a hidden league show hidden). `defaultNamePolicy` is the youth and mixed start; `adultStartNamePolicy` the adult one (its test holds it equal to what `readNamePolicy` reads). The web app's `NamePolicyOf` takes the audience, which `namesShownOf` reads first (unknown is youth).

## What happens to a league

- **Has saved nothing:** it starts where its audience says, read each time. An adult league shows adults in full and a child (Pia Hawkins, the made-up adult league's child) by first name and last initial, exactly as before.
- **Has saved a value:** it is followed for everyone. A saved `fullName` was confirmed, so it shows everyone in full, as before. A saved first name and last initial, or hidden, now also shows adults that way: the admin chose less, and R-29 says it is followed.
- **Changes who plays later** (no command does this yet): a league with nothing saved starts again from its new audience, so an adult league that becomes mixed or youth shows everyone, children and people of unknown age included, by first name and last initial. A league that saved full names unconfirmed as an adult league has nothing stored, so the same. A league with a stored, confirmed `fullName` keeps it: the confirmation was given for "the children in this league". When in doubt the reader shows less: a child is never in full without a stored confirmed value. The command that one day changes a league's audience should say so on its screen (a question for the lead below).
- **Archived or suspended:** a move toward less still works (R-26). Going back to an adult league's start from hidden or first name and last initial shows more and is refused, by either door (saving full names, or "Go back to the default").

## What the rule above all is checked by

`packages/core/src/modules/people/no-more-than-before.test.ts` pins, in the test itself, the behaviour before this step (record 056's rules), and for every combination of who plays (3) × what the league has stored (nothing, or each of the three values) × the initials switch (not stored, off, on) × the person's age (child, adult, not known) × their request (none, initials, removed), 324 in all, reads the stored settings with `readNamePolicy` and shows the name with `showName`, as every public surface does. It fails if any case shows more than before, and if any case differs other than as allowed: an adult shown less where the league stored first name and last initial or hidden, or where a youth or mixed league that stored nothing starts on first name and last initial. It also checks that nothing changes in an adult league that has chosen nothing, nor for any child anywhere, and the league that changes who plays. Changing `showName` to ignore the confirmation makes four of its five tests fail (tried while writing it). R-28 (a birth date decides) is not built yet: when step 2.146 builds it, a birth date either side of 18 joins the ages.

## Every reader goes through it

The roster (`publicRosterLine`), the statistics (`readStatisticsTable`), the game page (`readGamePage`), the snapshot (`readGameSnapshot`) and the live message (`liveMessageOf`) take the policy from `namesShownOf` with the league's saved setting, on the stand-in (`standInPorts`, one settings store) and in the database's public queries, which take the policy from their caller. Fixed values found, none of them a public page today:

- `packages/database/src/queries/list-binned.ts` gives the admin's bin list names through `showName` with a fixed "adult, full names, confirmed" policy: a staff view, unchanged by this step (step 2.108's audit decides staff views).
- `apps/web/src/server/stand-in-games.ts` and `stand-in-public-stats.ts` fall back to `startingNamePolicy` with an unknown audience (youth) when no policy reader is given: only tests that build them alone use the fallback; `standInPorts` always passes the real one.
- `apps/web/src/server/stand-in-tracker.ts` gives a made-up player of no stated age `isMinor: false`; the draft league's audience is not known, so it is read as youth, and its game page now shows those players by first name and last initial (less).
- The database-backed web ports serve no public page yet (`database-ports.ts`: `notMovedYet` for public statistics, teams and games); step 2.93 must read the policy with `namesShownOf` and the league's audience when it moves them.

## Not done here

- In the statistics, a hidden player still reads "A player (name not shown)"; "#12" with the team there is step 2.146's.
- The "Show as" control and requests reaching the public pages: steps 2.93 and 2.146 (record 056).
