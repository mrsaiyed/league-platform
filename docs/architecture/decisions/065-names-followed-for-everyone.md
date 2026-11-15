# 065 — Names followed for everyone, and the parents' confirmation as a setting of its own

Date: 2026-11-15. Step 2.162; answers the 2.106 audit's finding H13; serves R-14, R-15, R-24, R-25, R-26, R-27, R-29, T4 §7 (T-81), T5 §6 (T-98), P4 §6. Extends record 056. Written by the step's builder for the lead (technical). T-268. Rewritten the same day after the code review and the area 5 review, when the lead corrected R-29: the first version started each kind of league differently (`startsAs`) and kept the confirmation inside how the names value was written; both are gone.

## Problem

Record 056 made "Names on public pages" act on children only (and on people of unknown age in youth and mixed leagues). In an adult league all three choices left every name in full while the screen said "The setting was saved." R-29 makes the choice followed for every player. Two things must not happen on the way: no league's pages may change until its admin chooses, because adults are shown by full name unless they ask otherwise (R-15, the founder's own rule); and a child must never be shown in full without the admin's confirmation (R-14). The database keeps a setting as exactly `{version, value}` (0007, `setting_values_value_document`), so a confirmation flag beside the value would need a migration.

## What

**Two declared settings decide names, beside the initials switch (record 056).**

- `privacy.publicNames`: `fullName` (the default, in every league), `firstNameLastInitial` or `hidden`, with its protective order (R-26). No value asks to be confirmed.
- `privacy.childrenInFullConfirmed`: yes or no, no to start, whole league only, `league.settings`. Yes asks to be confirmed (`confirm: [true]`, the agreed sentence `setting.privacy.childrenInFullConfirmed.confirm`); its protective order is yes then no, so taking it back works even in an archived or suspended league and giving it there is refused (R-26), whether done by saving no or by "Go back to the default". Saving it is its own act with its own activity entry (who and when, `confirmed: true` on a yes).

**The policy and the one function.** `NamePolicy` is `{ names, childrenInFull, playersMayAskForInitials }`; `readNamePolicy(settings)` reads the three settings. `showName` applies `names` to every player; a child (and a person of unknown age in a youth or mixed league) is shown by first name and last initial at most unless `childrenInFull` is exactly true; so a child is in full only where names are full names AND the confirmation is given. A recorded request for initials takes effect but never shows more than the league's choice, adults included. `defaultNamePolicy` is every league's start: full names, not confirmed, no initials asked: adults in full, children by first name and last initial, exactly what every league showed before.

**One writer.** `leagues.set_setting` and `leagues.clear_setting` are the only code that stores or removes a setting. `packages/core/src/modules/leagues/settings/only-writer.test.ts` reads the repository's code and fails if anything else calls the store's `writeSetting` or `clearSetting`, writes `setting_values` outside `write-setting-value.ts` and `delete-setting-value.ts`, or names either key outside the declarations. A second writer of the names setting could not show a child in full anyway: that needs the confirmation as well.

**A save that changes nothing writes nothing.** `leagues.set_setting` given the value already stored at that place, from the version read, answers "saved" with that version and writes no row and no activity entry (code review L3). A stale version is still refused.

**What the Privacy screen needs.** `LeaguesStore` says who plays (`leagueAudience`, the existing `findLeagueAudience`) and whether anyone not in the bin is recorded as a child (`hasRecordedChild`, the new query `has-recorded-child.ts`, yes or no only, with its two-league case); `readPrivacyFacts` hands both to the screen. A stored row carries when it was saved (`savedAt`, from `setting_values.updated_at`), and `listLeagueSettings` passes it on. The settings stand-in must be told who plays and who has a recorded child (both required, code review L4).

**The screen** (`apps/web/src/features/settings-area/privacy-notes.ts`): Privacy opens with one sentence for who plays (adults; young players; both), then what is in force now ("Now: adults are shown by full name, and children by first name and last initial.", and so on). The confirmation is drawn as one box to tick worded with the agreed sentence: ticked is yes and confirmed, unticked is no. It is offered in youth and mixed leagues, and in an adult league only where someone is recorded as a child (the made-up adult league has Pia Hawkins); otherwise one sentence says such a player is shown by first name and last initial. A confirmation already stored stays on screen so it can be taken back. Once given, the screen says "Confirmed on" the league's own date; the confirmer's name is not shown, because the activity log is not read on this screen and no query across people was added for it: the date alone. With names moved off full names, one line says the confirmation is kept but has no effect. Each names choice says what it does to adults and to children. The time zone comes from the public schedule's clock; the settings screen and the schedule both still run on the stand-in (step 2.93 moves both).

## What changes when this lands

**Nothing, for any league that has saved nothing.** Every league starts as before: adults by full name, children (and people of unknown age in youth and mixed leagues) by first name and last initial (code review L5). What changes is only what an admin chooses from now on: first name and last initial, or hidden, is followed for adults too.

A league that stored a value before this step (made-up data only: nothing is online, and no stored value exists outside made-up data):

- `firstNameLastInitial` or `hidden`: now followed for adults too. The admin chose it; that is R-29.
- `fullName`: under the old rules it could only be saved with the confirmation, but nothing records that apart from the activity log, so it now reads as not confirmed: adults in full, children by first name and last initial. Less for children, never more. This is a reading of made-up data only; a league that wants its children in full ticks the confirmation again. The seed and the league-making tool store no settings; the stand-ins store none at start. The made-up coaches are now recorded as adults (`stand-in-public-teams.ts`), so the youth league shows a coach in full beside its young players, as a real youth league with coaches recorded as adults does.

A league that changes who plays (no command does this yet): nothing in the names settings depends on who plays, so nothing moves except who counts as a child where an age is not recorded (an adult league become youth or mixed shows people of unknown age by first name and last initial). A confirmation given keeps its effect; the command that changes who plays should say so on its screen (question for the lead).

## What the rule above all is checked by

`packages/core/src/modules/people/no-more-than-before.test.ts` pins, in the test itself, the behaviour before this step (record 056's rules). For every combination of who plays (3) × what the league stored (nothing, or each of the three values) × the initials switch (not stored, off, on) × the person's age (child, adult, not known) × their request (none, initials, removed), 324 in all, it reads the stored settings with `readNamePolicy` and shows the name with `showName`, as every public surface does. An old stored `fullName` is compared with full names plus the confirmation now, since it was saved confirmed. It fails if any case shows more than before, and if any case differs other than as allowed: one kind only, an adult shown less where the league stored first name and last initial or hidden. It also pins that nothing at all changes for a league that saved nothing, in every kind of league; that nothing changes for any child; how an old `fullName` without the new setting reads (less for children only); that a child is in full only with full names and the confirmation; and that the confirmation never changes how an adult is shown. R-28 (a birth date decides) is not built yet: when step 2.146 builds it, a birth date either side of 18 joins the ages.

`packages/core/src/modules/name-policy-scan.test.ts` (T-81) builds the roster, the statistics, the game page, the snapshot and the live message under each names value and the start, with and without the confirmation, with and without adults allowed to ask, in an adult, a youth and a mixed league, and scans them for withheld names and private values. `tests/browser/privacy-names-test.mjs` (in `npm run test:web:browser`) walks it in a browser: the adult league's owner chooses hidden ("#4" on the team page, "A player (name not shown)" in the statistics: "#12" there is step 2.146's), then first name and last initial, then full names with no confirmation asked; the youth league's owner saves full names without the tick (young players by initial, the coach in full), ticks it (young players in full, "Confirmed on …"), and unticks it again.

## Every reader goes through it

The roster (`publicRosterLine`), the statistics (`readStatisticsTable`), the game page (`readGamePage`), the snapshot (`readGameSnapshot`) and the live message (`liveMessageOf`) take the policy from `namesShownOf` with the league's saved settings, on the stand-in (`standInPorts`, one settings store) and in the database's public queries, which take the policy from their caller. Fixed values found, none of them a public page today:

- `packages/database/src/queries/list-binned.ts` gives the admin's bin list names through `showName` with a fixed "adult, full names, confirmed" policy: a staff view, unchanged by this step (step 2.108's audit decides staff views).
- `apps/web/src/server/stand-in-games.ts` and `stand-in-public-stats.ts` fall back to `startingNamePolicy` when no policy reader is given: only tests that build them alone use it; `standInPorts` always passes the real one.
- `apps/web/src/server/stand-in-tracker.ts` gives a made-up player of no stated age `isMinor: false`.
- The database-backed web ports serve no public page and no settings screen yet (`database-ports.ts`: `notMovedYet`); step 2.93 must read the policy with `namesShownOf` when it moves them.

## Not done here

- In the statistics, a hidden player still reads "A player (name not shown)"; "#12" with the team there is step 2.146's.
- The "Show as" control and requests reaching the public pages: steps 2.93 and 2.146 (record 056).
- Showing who confirmed, not only when: it needs the activity log read on the settings screen.
