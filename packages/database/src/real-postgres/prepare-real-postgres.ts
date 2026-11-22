// What scripts/real-postgres.mjs (step 2.202, record 092) does inside a throw-away
// PostgreSQL it has just started on this computer, made-up data only (T-201). Three
// logins, each doing only its part, every connection encrypted and the server's
// certificate checked against the made-up authority (`ca`):
//
// 1. The server's own superuser, made by initdb, makes the tables' owner the way
//    Supabase's `postgres` is described (not a superuser; may create roles; bypasses
//    row-level security; no other power) and the database it owns. Its password is
//    forgotten as soon as this is done: nothing else ever uses it.
// 2. The tables' owner applies every migration with the repository's own runner, as a
//    release does (T-48), and makes the app's login as it was made on the test copy on
//    2026-11-13 (make-a-league.md step 2): a login that is a member of app_user and of
//    sign_in_store and has no power of its own (T-60).
// 3. The app's login is what the tests' app code connects as.
//
// Each role and database name below is fixed here; a password is made by the script and
// must be hex, so it is safe in the statement that sets it.
import { applyMigrations } from '../migrations/apply-migrations.ts';
import { connectPostgresDriver, type PostgresDriver } from '../migrations/postgres-driver.ts';

/** The fixed names in a throw-away server. */
export const realPostgresNames = {
  /** The server's own superuser (initdb's bootstrap role). Never handed to a test. */
  superuser: 'local_superuser',
  /** The tables' owner, named and made as Supabase's is. */
  owner: 'postgres',
  /** The app's restricted login. */
  app: 'app_login',
  /** The database the migrations are applied to. */
  database: 'league_platform',
} as const;

/** Where the script keeps the server's files unless told otherwise, in the repository. */
export const realPostgresFolder = '.local/pg';

/** The file in that folder the script writes the two addresses into, for the test helper. */
export const connectionFileName = 'connection.json';

/** How the script reaches the server it started. */
export type RealPostgresServer = {
  readonly port: number;
  /** The made-up authority's certificate, as PEM text. */
  readonly ca: string;
};

/** What preparing the server came to. */
export type PreparedRealPostgres =
  | { readonly ok: true; readonly applied: number }
  | {
      readonly ok: false;
      /** Which part stopped: making the owner, the migrations, or the app's login. */
      readonly step: 'owner' | 'migrations' | 'app-login';
      /** The database's error code or the runner's, never a message (it can hold a password). */
      readonly reason: string;
    };

const hexPassword = /^[0-9a-f]{32,128}$/;

/** A postgres:// address on this computer for `user` in `database`. */
export function localAddress(
  port: number,
  user: string,
  password: string,
  database: string,
): string {
  const url = new URL('postgres://localhost');
  url.port = String(port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

function checkedPassword(password: string): string {
  if (!hexPassword.test(password))
    throw new TypeError('A password here must be 32 to 128 hex digits.');
  return password;
}

const codeOf = (error: unknown): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Za-z0-9_]{2,40}$/.test(code) ? code : 'unknown';
};

async function as<T>(
  server: RealPostgresServer,
  user: string,
  password: string,
  database: string,
  work: (driver: PostgresDriver) => Promise<T>,
): Promise<T> {
  const driver = await connectPostgresDriver(localAddress(server.port, user, password, database), {
    ca: server.ca,
  });
  try {
    return await work(driver);
  } finally {
    await driver.close();
  }
}

/**
 * Makes the owner and its database (as the superuser), applies every migration and makes
 * the app's login (as the owner). Never throws for a refusal: it says which step stopped.
 */
export async function prepareRealPostgres(
  server: RealPostgresServer,
  passwords: { readonly superuser: string; readonly owner: string; readonly app: string },
): Promise<PreparedRealPostgres> {
  const names = realPostgresNames;
  const owner = checkedPassword(passwords.owner);
  const app = checkedPassword(passwords.app);
  try {
    await as(
      server,
      names.superuser,
      checkedPassword(passwords.superuser),
      'postgres',
      async (db) => {
        // Supabase's `postgres`, as the going-online audit describes it: not a superuser,
        // may create roles, bypasses row-level security, and nothing more.
        await db.exec(
          `create role ${names.owner} with login nosuperuser createrole bypassrls ` +
            `nocreatedb noreplication password '${owner}'`,
        );
        await db.exec(`create database ${names.database} with owner ${names.owner}`);
      },
    );
  } catch (error) {
    return { ok: false, step: 'owner', reason: codeOf(error) };
  }

  let applied = 0;
  try {
    const outcome = await as(server, names.owner, owner, names.database, async (db) => {
      const run = await applyMigrations(db);
      if (!run.ok) return run.error.code;
      applied = run.value.applied.length + run.value.alreadyApplied.length;
      return undefined;
    });
    if (outcome !== undefined) return { ok: false, step: 'migrations', reason: outcome };
  } catch (error) {
    return { ok: false, step: 'migrations', reason: codeOf(error) };
  }

  try {
    await as(server, names.owner, owner, names.database, async (db) => {
      // As on the test copy on 2026-11-13, and make-a-league.md step 2.
      await db.exec(`create role ${names.app} with login password '${app}'`);
      await db.exec(`grant app_user to ${names.app}`);
      await db.exec(`grant sign_in_store to ${names.app}`);
    });
  } catch (error) {
    return { ok: false, step: 'app-login', reason: codeOf(error) };
  }
  return { ok: true, applied };
}
