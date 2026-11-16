# Decision rows waiting to be folded in

[Decisions](../DECISIONS.md)

A lane does not edit `DECISIONS.md` (T-276, [record 072](../../../architecture/decisions/072-lanes-do-not-collide-in-shared-lists.md)). When a step adds or changes a decision, its lane writes the rows here instead, in one file named for the decision, such as `T-276.md` or `S-64.md`, so two lanes never touch the same file:

```md
# T-276

## T9 — Quality and maintainability

| T-276 | The decision, as its row in the full list says it | Agreed (delegated) | |

## Change log

| T-276 | New | Agreed (delegated): what it now says | Why |
```

- Each `## heading` is a heading of `DECISIONS.md`, in its words without the link: `T9 — Quality and maintainability`, `Change log`, `Decided for you, waiting for your yes`, `P7 — Teams, schedule and game day`.
- Under it, the row as it will stand in that table, with one cell for each of the table's columns. The cells need no padding.
- A row with an ID that a table of the full list already has replaces that row (a decision whose words or status change). In the change log and "Decided for you" a row is added at the end.
- Statuses are written as the lead decided them: "Agreed (delegated)", "Decided for you" and so on. Only the founder's own words make a row "Agreed".

The spec file the decision changes is still corrected in the lane (T-185); only the rows wait here. `npm test` folds every file here into a copy of `DECISIONS.md` (`tests/pending-decisions.test.mjs`), so a wrong heading or a missing cell fails in the lane. At landing the lead runs `node scripts/fold-pending-decisions.mjs`, which puts each row in its table and place, formats the file, and removes the files it folded, in the landing commit.
