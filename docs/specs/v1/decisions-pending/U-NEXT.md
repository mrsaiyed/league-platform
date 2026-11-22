# U-NEXT (the lead gives the number at landing): what P3's "Must fix" checks mean today

Status: **Decided for you** (a builder, step 2.240, 2026-11-22). Not agreed: the founder's own words make it agreed.

Spec: P3 §3 "Must fix" (line 67), U-9, U-14, O-2, record 065.

## The question

P3 says publishing is blocked while sample data is still present, the league has no contact email, or, for a youth league, its privacy choices are not confirmed. Step 2.240 builds the Publish button; how is each check known?

## The answer

1. **No contact email: enforced.** The league's contact email is kept on its row when it is made (`leagues.contact_email`); publishing refuses while it is empty, with its own sentence. There is no screen to change it yet, so the sentence says to write to us and we add it. A league made by `league:make` always has one.
2. **Privacy choices not confirmed: enforced**, for a league with under-18s: a youth or mixed league, or an adult league where anyone is recorded as a child (record 065). "Confirmed" means the league has saved "Names on public pages" itself, even to keep how it starts; the parents' confirmation for children in full names keeps its own tick (R-14) and is not asked for here. The refusal says to save it under Privacy, and the screen links there.
3. **Sample data still present: put off.** The product has no sample data yet (O-2 is not built), so there is nothing to find. This check comes with the step that brings sample data, which must add it to the same pure function (`packages/core/src/modules/leagues/rules/publish-checks.ts`).

## Why

These are the readings that use only what the product already knows, invent no machinery, and leave the admin the choice: each check is one line of one function and easy to change later. Asking for the names setting to be saved, rather than set to a particular value, keeps the choice the league's.

## What changed with it

P3 §3's sentence was corrected to match (T-185).
