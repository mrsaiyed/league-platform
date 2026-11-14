# 034 — The fixture import holds the file only until the worker has read it

Date: 2026-11-13. Step 2.22; serves P7 §4 "Also", O-4, T3 §11, T-80, T-130, T-131, T-137. Decided by the lead (technical). T-246.

## Problem

T-80 says an import spreadsheet is read once by the worker and never kept for download or served. T-131 says a job carries ids, never content. T-130 says a job is recorded in the same transaction as the change that causes it. Together they leave a gap: the admin's file has to get from the web app to the worker, which is another process, and neither a job nor a table made for files may hold it.

## What

- **The text rides in the import's row until it is read.** Starting an import makes an `imports` row in `reading` whose `report` document is `{version: 1, upload: <the file's text>}`, and records an `imports.run` job with `{importId}` in the same transaction. The worker reads the text with the reader of step 2.10, and the same save that sets the status to `ready` (or `failed`) replaces the document with the report. After that no column holds the file's text: the report has the games it found and the problems in plain words, in the file's own words only for short echoes. No migration was needed.
- **Never served.** `getFixtureImport` returns the report's parts and never the `upload` text, even while the import is still being read.
- **Size.** The file is at most 2,000,000 characters (the reader's limit) and its JSON text at most 800,000 bytes, so it fits the database's one-megabyte check on a report. A larger file is refused when it is uploaded, with a message to split it. The report itself is also kept under 800,000 bytes; a file with so many games that its report would not fit is marked failed with that reason.
- **A job run twice does nothing the second time.** Only an import still `reading` is read; the job's dedupe key is the import's id, so it is recorded once.
- **The worker acts for nobody.** The read is a function the worker calls inside its transaction (`readFixtureImport`), not a command, as the invitation email job does; the commands the admin runs (`start_fixture_import`, `apply_fixture_import`, `undo_fixture_import`, `record_imported_scores`, `get_fixture_import`) all need `schedule.import` (scores: `games.score`) at the season's program.
- **Apply adds to the draft; the games' ids are made from the import.** Each game's id is made from the import's id and its row number, so applying cannot add a game twice. Applying appends `add-game` changes to the season's draft (starting it if there is none) and the import keeps in `created` the draft's id and version just after, how many changes were there before and how many it added, the games' ids and the final scores waiting for them.
- **Undo is exact or refused.** Undo removes the import's changes only while the draft is still the one it was left as (same id, same version). If the draft was edited, published or discarded since, nothing is touched and the admin is told to remove the games by hand.
- **Scores wait for publication.** A draft game is not a game, so a final score cannot be recorded until the schedule is published. `record_imported_scores` records the waiting scores of those games that exist by then, as `record_final_score` would (ties judged by the game's rules, the `games.finalized` event announced), and marks each so it is never recorded twice. Publishing (step 2.21) must keep the draft's game ids for this to find them.

- **An upload that is never read does not stay.** When the job's last attempt fails (or it fails with an error that is not retried), the worker replaces the text with a failed report that holds none. If the job was lost altogether, an admin can discard the import (`discard_fixture_import`), which does the same for an import still `reading`. Only an import still `reading` is touched.
- **Seeing an import** needs `schedule.import` but works in an archived or suspended league, as reading the draft does. Recording an import's scores needs `schedule.import` as well as `games.score`, so a scorekeeper limited to assigned games cannot record a whole file's scores.

## Considered

- **A private storage bucket with a deleted-after-read object.** A real service to run and pay for, a second place to secure, and a path that must be made atomic with the job. The row is already league-fenced and in the transaction.
- **A table of uploads.** A migration for a table whose rows must never outlive their reading; the row we already have does the same.
- **Reading the file in the web request.** Against T7 §2 (the worker reads) and it would hold a web request open for a large file.

## Cost, said plainly

Until the database reclaims the old version of the row, and in its backups, the text exists after it was replaced. It is never readable through the app. If that is not good enough for a league's data, the answer is a short-lived private object store behind a provider interface, replacing only `insertImport` and `readFixtureImport`'s source.
