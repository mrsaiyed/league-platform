# A real PostgreSQL on this computer, for tests

How to start, use and stop the throw-away PostgreSQL that the database's tests on a real server run on (step 2.202, [record 092](../architecture/decisions/092-a-real-postgresql-for-tests.md), T-292). Everything else on the database runs on the in-process one (PGlite), which has one session, no encryption and runs everything as a superuser. This one is real: many connections, encryption with a certificate to check, and the same roles as Supabase.

Made-up data only (T-201). It answers on this computer only, it reaches no other computer and no real service, and it never holds a real person's data, a real league or a real key.

## What it needs

- **PostgreSQL 16 or newer, already installed.** Nothing is installed for you. It looks in `/usr/lib/postgresql/<version>/bin` (Debian, Ubuntu and GitHub's machines; the newest version first), then in each folder on `PATH`. If yours is somewhere else, set `REAL_POSTGRES_BIN` to the folder that holds `initdb`, `pg_ctl` and `postgres`.
- **openssl** on `PATH`, which makes the made-up authority and the server's certificate (Git Bash on Windows has one).
- Run as an ordinary user. As root (a cloud machine), PostgreSQL will not run, so the server runs as the computer's own `postgres` account, which PostgreSQL's package made.
- Run as root, the server runs as the `postgres` account: `start` lets that account pass through the folders on the way to `.local/pg` (o+x, g+x, never read), notes their old modes in `.local/pg/modes-on-the-way.json`, and `stop` puts them back.

Where something is missing it stops before starting anything and says what and where it looked:

```
FAILED: no PostgreSQL was found on this computer, so nothing was started and no test ran.
  Missing: initdb, pg_ctl, postgres (PostgreSQL 16 or newer; nothing is installed for you).
  Looked in: /usr/lib/postgresql/<version>/bin; each folder on PATH.
```

## The commands

| What you run                            | What it does                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:real-postgres`            | Starts a server if none is running, runs every test in `tests/real-postgres` on it, one file at a time, then stops the server it started. Ends `PASSED: ...` or `FAILED: ...`. |
| `node scripts/real-postgres.mjs start`  | Starts a fresh one and leaves it running, for tests run one by one or a look by hand. If one is running already, it says so and changes nothing.                               |
| `node scripts/real-postgres.mjs status` | Says whether one is running, its version, port and process. Never a password or an address.                                                                                    |
| `node scripts/real-postgres.mjs stop`   | Stops it, checks no process of it is left, and removes its folder.                                                                                                             |

Options: `--bare`, with `start` only (step 2.207): the tables' owner and its empty database and nothing more, no migration and no `app_login`, as a new Supabase project is, for `npm run rehearse:test-copy`, which then follows [the new test copy procedure](new-test-copy.md) on it (`connection.json` still holds an `app_login` password, made at the start, for the procedure to give); `--port <number>` (default 54329, not 5432, which a computer's own PostgreSQL may use) and `--folder <folder>`, which must be a folder of its own inside `.local` (default `.local/pg`), because `stop` removes it whole.

One test file on a running server: `npx vitest run --config tests/real-postgres/vitest.config.ts tests/real-postgres/league-fence.test.ts`, or `npm run test:real-postgres -- tests/real-postgres/league-fence.test.ts`.

`start` takes about two seconds and prints:

```
Started a throw-away PostgreSQL 16.15 for tests, on this computer only (localhost, port 54329).
  Its files: .local/pg (made-up data only; "stop" removes them).
  Encrypted: required, with a certificate signed by a made-up authority made just now.
  Migrations: 20 applied by the repository's own runner, the certificate checked.
  Logins: the tables’ owner, made as Supabase’s "postgres" is (not a superuser; may create
  roles; bypasses the fence), and app_login, made as on 2026-11-13.
  A test gets the two addresses and the authority’s file from the test helper.
Stop it with: node scripts/real-postgres.mjs stop
```

## What is inside

- **The server** listens on `localhost` only and has no socket file. `pg_hba.conf` lets in an encrypted connection from this computer with a password, and nothing else: a connection without encryption finds no line and is refused. It does not wait for the disk, since nothing in it needs to survive.
- **The certificate** names `localhost`, `127.0.0.1` and `::1`, and is signed by a made-up authority made at each start ("SR Leagues made-up test authority (not trusted anywhere)"). The authority's key is removed once it has signed, so nothing more can be signed with it. A client that checks certificates without being given the authority's file is refused, as the web app would be by Supabase's today (going-online audit, H1).
- **Three roles.** The server's own superuser (`local_superuser`, made by `initdb`) makes the tables' owner and its database, then its password is forgotten: no test and no command ever uses it again. The **tables' owner**, `postgres`, is made as the audit describes Supabase's: not a superuser, may create roles, bypasses the fence, nothing more. It applies every migration with the repository's own runner, the certificate checked, as a release does, and makes **`app_login`** as on the test copy on 2026-11-13 ([make-a-league.md](make-a-league.md), step 2): `create role app_login login password '…'; grant app_user to app_login; grant sign_in_store to app_login;`.
- **Its files**, in `.local/pg` (git ignores `.local`): `data` (the server's own), `tls` (the certificates and the server's key), `server.log`, and `connection.json`, which holds the owner's and `app_login`'s addresses, passwords included, readable by you only. The passwords are made at each start.
- **A failed start** leaves `data/`, `tls/` and `server.log` in its folder for you to read (nothing is left running); `stop` or the next `start` removes them. `stop` and `start` remove only a folder that is empty or holds their own marks (`connection.json`, `modes-on-the-way.json` or `data/PG_VERSION`): naming any other folder inside `.local` is refused and removes nothing.

## What a test gets, and what it may do

A test imports `packages/database/src/real-postgres/real-postgres.test-helper.ts`:

- `realPostgres()` gives `{ ownerUrl, appUrl, caFile }`: the two addresses and the authority's file, and nothing more. It refuses an address that is not a plain one on `localhost`, and when no server is running it fails with the words to start one: a test on a real PostgreSQL never skips.
- The probes there ask the server what the tests check (who a transaction is, which leagues and rows it sees, whether every table's fence is on, the roles' powers), because SQL lives only in `packages/database`. `switchFence` switches one table's fence off and on as the owner: only the planted-fault test does, and switches it back in a `finally`.
- A test makes its leagues through the product's own tools (the league-making tool's hosted path), with names no earlier run used, since a server started by `start` may already hold some.

A test here may not: reach any server but this one; use or ask for the superuser; leave a change to the schema behind; depend on another file's data or on running beside another file.

## When something goes wrong

- **"is already running"**: stop it first for a fresh one.
- **The tests stopped half-way** (Ctrl+C): `npm run test:real-postgres` is made to wait for the tests to end and then stop the server it started (not yet tried by a test). If one is left, `node scripts/real-postgres.mjs stop` stops it. A server started by `start` keeps running until `stop`.
- **The computer restarted with one running**: `start` and `stop` both find the files of a server no longer running, say so and remove them.
- **"FAILED: the test PostgreSQL could not start"**: the log named in the message says why (most often the port is taken: use `--port`).
- **A process left after stop**: `stop` says which, keeps the folder, and ends with a failure. Stop it by its own number, never by name: other checks may run on this computer.

## On GitHub

GitHub's check does not run it yet. It joins when the lead has seen GitHub's machines run it (step 2.99's line, after lane 2.191). Until then it is run on a builder's or the lead's computer.
