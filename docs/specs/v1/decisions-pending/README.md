# Decision rows waiting to be folded in

[Decisions](../DECISIONS.md)

A lane does not edit `DECISIONS.md` (T-276, [record 072](../../../architecture/decisions/072-lanes-do-not-collide-in-shared-lists.md)). When a step adds or changes a decision, its lane writes the rows here instead, in one file named for the decision, such as `T-276.md` or `S-64.md`, so two lanes never touch the same file:

```md
# T-276

New

## T9 — Quality and maintainability

| T-276 | The decision, as its row in the full list says it | Agreed (delegated) | |

## Change log

| T-276 | New | Agreed (delegated): what it now says | Why |
```

- The first line is `# <ID>`, the ID in the file's name. The line under it says what the file is: **`New`** for an ID the list does not hold yet, or **`Change`** for a decision already in the list whose words or status change.
- Each `## heading` is a heading of `DECISIONS.md`, in its words without the link: `T9 — Quality and maintainability`, `Change log`, `Decided for you, waiting for your yes`, `P7 — Teams, schedule and game day`.
- Under it, the row as it will stand in that table, with one cell for each of the table's columns. The cells need no padding.
- In a table of the full list a `New` row goes in its ID's place and a `Change` row replaces the row with its ID. In the change log and "Decided for you" a row is added at the end.
- Statuses are written as the lead decided them: "Agreed (delegated)", "Decided for you" and so on. Only the founder's own words make a row "Agreed", and nobody takes that back.

What is refused, in the lane by `npm test` and at landing by the lead's script, with nothing written: a `New` file whose ID the full list already holds; a `Change` that would replace a row whose status starts with "Agreed" (the lead can allow one ID with `--replace-agreed <ID>`); and a row whose status is exactly "Agreed" for a decision that is not technical, an ID not starting `T-` (the lead allows it with `--founder-agreed <ID>` only while quoting the founder's words in the landing commit).

The spec file the decision changes is still corrected in the lane (T-185); only the rows wait here. `npm test` folds every file here into a copy of `DECISIONS.md` (`tests/pending-decisions.test.mjs`) under those rules, so a wrong heading, a missing cell or a refusal shows in the lane. At landing the lead runs `node scripts/fold-pending-decisions.mjs` (first with `--check`), which prints every row it adds or replaces with the old status and the new, puts each row in its table and place, formats the file, and removes the files it folded, in the landing commit.
