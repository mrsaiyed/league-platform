# 080 — Whether a person is a child: one rule, kept twice

Date: 2026-11-17. Step 2.93 part 5 (T-284), with the rule of step 2.146 it waits for (R-28, changed November 17 by the lead's decision on the area 5 lead's review). Serves T4 §7, T-76, T-81, R-14, R-16, R-25.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up database (PGlite) only.

## Problem

Who counts as a child decides how much of a name a public page shows (R-14, T-81) and whether a request for initials is always taken (R-25). R-28 says: a child if their date of birth says so (under 18 on the league's own today, in its time zone) or the "minor" tick is on; a date that says adult unticks no one; a date that cannot be read counts as a child; with neither, the league does not know and its audience decides (R-15).

The made-up world keeps people in memory and needs the rule in code. The database keeps the birth date, and the step's line asks that it never leave the database: a public read, or a command that needs only "child or not", should be given the answer, not the date. One copy cannot do both: code cannot run inside a SQL query, and SQL cannot run on the made-up world.

## What

- **The rule in core**: `isMinorOn(person, leagueToday)` in `packages/core/src/modules/people/rules/minor-by-age.ts`, for the made-up world's reads (`minorAt` in `stand-in-world-clock.ts`) and core's test store. The 18th birthday is the same month and day 18 years on, compared as text, so a 29 February child stays one until 1 March.
- **The rule in SQL**: `isMinorSql()` in `packages/database/src/queries/minor-by-age-sql.ts`, one expression on the `people` row and the person's own league's today (`now() at time zone` the league's zone, the database's clock). A comparison with no answer (no league row to give a today) counts as a child. The public roster, the people for the name function (statistics, game page, tracker), "has the league a recorded child" (Privacy settings) and the people store's `isMinor` (the name-request command, `findPersonIsMinor`) select it. None of them selects the date.
- **Held together by a test**: `minor-by-age-sql.test.ts` runs 234 cases (birthdays, 29 February, a year's end, a date in the future, a year mistyped far in the past, the tick on, off and unknown) through both and finds no difference, plus the comparison with no answer. A change to one copy that is not made to the other fails it.
- **Nothing else reads the columns**: `minor-by-age-scan.test.ts` fails when any source file of packages/database but the helper names `is_minor` or `birth_date`, beyond a listed few: the private columns given only to `people.read_sensitive` (T-76), the two writes, and the generated types.

## Considered

- **One copy, in core, with the date sent out of the database.** Each read would select `birth_date` and `is_minor` and run `isMinorOn` on them. Simpler, one rule, but the date of every child on a public page would cross into the app's memory, and a date that arrives as text in another form (a connection set to another date style) would be read otherwise by the code than by the database. The reviewer showed such a disagreement on the name-request command, which did this.
- **A stored column** (`counts_as_child`, kept up to date). The answer would go stale at every birthday without a nightly job, and the job's missed night is exactly the case R-28 is about. A view or generated column cannot use "today".
- **The rule in SQL only**, with the made-up world asking the database. The made-up world has no database.

## Would make us revisit

- A third place that needs to know (a report, an export): it selects `isMinorSql()`, or the scan fails.
- Another age than 18 for a league (a youth league's own cut-off): the rule gains the league's age in both copies, and the parity test its cases.
- A date of birth kept outside `people` (profiles, registration answers): the helper and the scan widen to it.
