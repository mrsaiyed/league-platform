# Apply migrations

How the database's structure changes, how the runner applies the numbered SQL files, what stops a run, and how to run it locally and against a test copy. The decision is in [record 006](../architecture/decisions/006-migration-runner.md); the rule that the schema changes only through these files is T-48.

## The files

- The schema lives in numbered SQL files in `supabase/migrations/`. Today there are eleven, `0001_migration_log.sql` to `0011_game_corrections_by_transaction.sql`.
- **Name**: four digits, an underscore, then a lower-case name with underscores, ending `.sql`: `0012_example_change.sql`. The number is the order.
- **No gaps and no repeats.** The first file is `0001`; the next is `0002`, and so on. A duplicate number or a gap stops the run before anything is applied.
- **Only `.sql` files belong in the folder.** A sub-folder, a symbolic link, or a `.sql` file with another name stops the run. Other files (such as a README) are ignored.
- **Never edit a file once it has been applied.** A later change goes in a new numbered file.
- **Never begin, end or split a transaction inside a file.** No `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `END` or similar. Each file already runs as one transaction; a statement like that would end it early and leave the file half applied. An empty file (only comments) is also refused.

## Fingerprints (checksums)

- Each file's text is normalised first: the byte-order mark is removed and Windows line endings (CRLF) become LF. So the same file gets the same fingerprint on Windows and Linux.
- The fingerprint is the SHA-256 of that text, 64 hexadecimal characters. It is written to `migration_log.applied` with the file's number and name when the file is applied.
- On every run, each recorded file is compared with the file in the folder. If one was **edited, renamed or removed** since it was applied, the run stops with a message. The fix is to put the file back as it was and make the change in a new migration.
- A database that is **ahead of the folder** (for example after a release was reversed) is allowed: the run reports the newer files and changes nothing. An **empty folder against a used database** is refused, because it means the wrong folder.

## How a run works

1. **Read the folder** and check every file's name, number, order, checksum and content (`load-migrations.ts`, `validate-migrations.ts`).
2. **Take the run lock.** A PostgreSQL advisory lock with one fixed key holds the run. A second run waits, trying every 500 milliseconds, for up to 60 seconds, then stops with "another run held the lock" and applies nothing.
3. **Make the bookkeeping table** if it is missing. It lives in its own schema, `migration_log`, outside `public`, so the hosted API never exposes it. `0001_migration_log.sql` then locks that schema down.
4. **Read the log** and check every recorded file against the folder (step above).
5. **Apply each pending file in its own transaction.** Inside the transaction the runner checks the log again (for update, so two runs cannot both apply the file), runs the file's SQL, then inserts its log row. Either the file and its log row both commit, or neither does. A failure rolls the file back and stops the run; the files before it stay applied.
6. **Release the lock** at the end, whatever happened.

Running it again does nothing if every file is already applied. The result says which files were applied now and which were already there.

Limits are set for each transaction only: a lock timeout of 10 seconds and a statement timeout of 10 minutes by default. They are options of the runner, and each must be a positive whole number of milliseconds.

## The drop-and-rename rule

A release runs the old version of the app and the new schema side by side for a short time, so removing or renaming something in one step breaks the running version. `npm run check` therefore runs a safety check on every migration (T-183, `scripts/structure/migration-safety.mjs`):

- **Rejected**: `DROP` of anything except indexes, policies and triggers; dropping a column in an `ALTER` (a `DROP COLUMN`, or a bare `DROP` inside `ALTER TABLE`); `RENAME`; `SET SCHEMA`; `TRUNCATE`; and dynamic SQL (`EXECUTE`, `format(...)`), which the check cannot read.
- **Allowed**: a file that does one of these is listed in `migrationDropsAllowed` in `scripts/structure/config.mjs`, by its file name, its checksum and a reason (which release stopped using what it removes). If the file changes afterwards, the entry stops counting. The list is empty today.
- The safe way is two releases: add the new thing first while the old still works, then remove the old in a later file.

## Running it locally

- **Seed database**: `npm run seed` applies every migration to a PGlite database in `.local/seed-db`, then loads made-up leagues. It is the most common local run. See [run it locally](run-it-locally.md).
- **Any PGlite folder**: the seed script takes the folder as its argument, so `npm run seed -- path/to/folder` applies the migrations to that folder too.
- **In code**: tests call `applyMigrations(pgliteDriver(db))` on an in-memory PGlite database, so each test starts from a fresh schema.

PGlite is real PostgreSQL inside Node (record 048), so these runs use the same SQL as a hosted database.

## Running it against a test copy of the hosted database

The runner can reach any PostgreSQL address through `connectPostgresDriver(url, options)` in `packages/database/src/migrations/postgres-driver.ts`. Its rules:

- **Use the direct connection** (Supabase port 5432, or the Session pooler). A transaction-mode pooler, such as port 6543, hands each statement to a different connection, which breaks the run lock and can split a file's transaction. The driver's header says so.
- **SSL is verified by default**: the server's certificate must be valid, checked against the system's certificate authorities or a `ca` given in the options. `'no-verify'` is an explicit opt-out for a provider whose certificate cannot be checked; `'off'` is only for a database on this computer.
- **The address is never the place for SSL settings**: `sslmode` and similar parameters are removed from the address and set by the options, so a copied address behaves the same everywhere.
- **Use the test copy only, with made-up data.** Never run this against production. Real people's data exists only in production (T-13, T-201). Connection values are never written into these notes or into the repository.

Honest status: the driver is tested against PGlite over a local socket. **It has not yet been run against a hosted database.** No npm command runs migrations against a hosted database, and the release step that will call the runner (T-48: applied automatically on release) is not in the repository yet. The first real run is the gate named in record 012 and in record 046.

## Where to look

- `packages/database/src/migrations/run-migrations.ts`: the run itself.
- `packages/database/src/migrations/load-migrations.ts` and `validate-migrations.ts`: reading and checking the folder.
- `packages/database/src/migrations/checksum.ts`: the fingerprint.
- `scripts/structure/migration-safety.mjs` and `scripts/structure/config.mjs`: the drop-and-rename rule and its allowed list.
- `supabase/setup.sql` is a different file: it sets up the live stat tracker's Supabase project in one paste and is generated by `npm run build:supabase`. The runner does not produce it.
