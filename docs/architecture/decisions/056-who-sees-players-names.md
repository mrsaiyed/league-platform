# 056 — Who sees players' names: the two privacy settings, a confirmed value and the person's request

Date: 2026-11-14. Step 2.126 (part 1); answers the 2.105 audit's finding H2; serves T4 §7 (T-81), T5 §6 (T-98), R-14, R-15, R-17, R-23. Decided by the builder of step 2.126 for the lead (technical). T-259.

## Problem

Step 2.11 built the one name function (`showName`) and the display policy it applies, but nothing set the policy: every public page, live message and statistic read the fixed starting value `defaultNamePolicy`. No setting held the league's choice (R-14, R-15), no command wrote a person's own request to `people.visibility` (R-23), and switching to full names had nowhere to ask the admin to confirm that the league has the permission it needs (R-14).

## What

**Two declared settings (T-98), in the leagues module's one list**, both for the whole league only, changed with `league.settings` (the owner and admins; a scorekeeper or registrar cannot):

- `privacy.publicNames`: `firstNameLastInitial` (the default) or `fullName`. It decides how children are shown; adults are shown by full name whatever it says (R-15), and a person whose age is not known counts as a child in a youth or mixed league (unchanged from step 2.11).
- `privacy.playersMayAskForInitials`: yes or no, no to start (R-15).

**A declared setting may ask the admin to confirm a value.** A declaration may list values in `confirm`; `privacy.publicNames` lists `fullName`. `leagues.set_setting` refuses such a value with `confirmation-needed` unless its input says `confirmed: true`, and the activity entry then records `confirmed: true`. The words of what is confirmed are the message `setting.<key>.confirm`, and the settings screen draws a box to tick from the declaration alone, so no setting is written into the screen by hand. The check is in the command, not only the screen, so no other caller can skip it. Going back to first names and initials needs no confirming.

**One read of the policy.** `readNamePolicy` (people module) reads the two settings at the league level, falling back to our starting values, and returns the `NamePolicy` that `showName` takes. It is not a command: a public page reads it with no permission. The web app reads it through `namePolicyOf` (`apps/web/src/server/name-policy-of.ts`) on the settings' own transaction; the stand-in public statistics (so the team and statistics pages) and the stand-in live messages take it in place of `defaultNamePolicy`. Step 2.93's database-backed ports read it the same way.

**A person's request is a command.** `people.set_name_request` writes `people.visibility` (`none`, `initials` or `removed`; the column and its check exist since 0008, so no migration). It needs `people.manage` (the owner, admins and registrars, R-23), refuses an archived or suspended league, a person in the bin and a stale version (T-46), and writes nothing when the request is already that. Initials take effect only while the league lets players ask for them (R-15); the request is kept either way, so switching the setting on later honours what was asked.

**The reason is one of a fixed list.** R-23 keeps the reason in the activity log, and the activity log holds ids and fixed words only, never personal details (A-6, 0004). A typed reason ("her mother phoned") would put personal details into history that is never changed or erased. So the reason is `personAsked`, `guardianAsked` or `leagueDecided`, and the entry's details are `{ showAs, reason }`.

## Not done here

- The "Show as" control on a person's record (Admin → People, or the roster line in Admin → Teams until step 2.50 lands): step 2.126's screen part. The command it posts to is built and tested.
- The stand-in public rosters keep their own made-up requests; a request set by the command reaches the public pages once the pages read people from the database (step 2.93).

## Checks

Core: the declarations and the confirm rule (`define-setting.test.ts`, `set-setting.test.ts`), `read-name-policy.test.ts` (the T-81 scan of a youth roster under each value of both settings), `set-name-request.test.ts`. Database: the command on PGlite with its activity entry (`people-commands.test.ts`), its two-league case and its role-matrix row. Web: `name-policy-of.test.ts` (the admin's saved setting changes the team page's names; a scorekeeper is refused; the scan under each setting) and `settings-area.test.ts` (the Privacy group and its confirm box).
