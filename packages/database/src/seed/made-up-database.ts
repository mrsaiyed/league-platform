// A database of made-up data, in memory, for running the apps on one computer and for
// their tests (T-195, T-201): every migration applied, the made-up seed leagues loaded,
// and then logged in as a login role fit for the app (T-60): a member of app_user that
// is not a superuser and owns nothing, as a hosted login is meant to be. So the app's
// start-up check (checkLoginRole) passes here for the same reasons it must pass on a
// hosted database, and the app's queries run as that login, not as the superuser.
// That shows the app needs no more than the login's powers; it is not a wall. The
// session was opened by the superuser, so SQL run on it could switch back (`set
// session authorization postgres`), which a hosted login cannot do.
//
// It takes nothing and opens no address, so it cannot reach a real database. It is
// gone when closed: nothing is written to disk.
import { PGlite } from '@electric-sql/pglite';
import type { DatabaseSource } from '../db/create-database.ts';
import { applyMigrations } from '../migrations/apply-migrations.ts';
import { pgliteDriver } from '../migrations/pglite-driver.ts';
import { seedLeaguesInto } from './seed-leagues.ts';

/** The login role a made-up database is used as. */
export const madeUpLoginRole = 'made_up_app_login';

export type MadeUpLeague = {
  readonly slug: string;
  readonly leagueId: string;
  readonly ownerAccountId: string;
};

export type MadeUpDatabase = {
  /** For createDatabase, and for anything else that takes a database. */
  readonly source: DatabaseSource;
  /** The seed leagues it holds. */
  readonly leagues: readonly MadeUpLeague[];
  /** Ends it; everything in it is gone. */
  readonly close: () => Promise<void>;
};

/** Opens a new made-up database in memory. Close it when done. */
export async function madeUpDatabase(): Promise<MadeUpDatabase> {
  const pglite = new PGlite();
  try {
    const run = await applyMigrations(pgliteDriver(pglite));
    if (!run.ok) throw new Error(`The made-up database could not be built: ${run.error.code}.`);
    await seedLeaguesInto(pglite);
    const { rows } = await pglite.query<MadeUpLeague>(
      `select slug, id as "leagueId", owner_account_id as "ownerAccountId"
       from leagues order by slug`,
    );
    // From here on the session is the fit login, no longer the superuser that built it.
    await pglite.exec(`
      create role ${madeUpLoginRole} login nosuperuser nocreatedb nocreaterole nobypassrls;
      grant app_user to ${madeUpLoginRole};
      set session authorization ${madeUpLoginRole};
    `);
    return {
      source: { kind: 'pglite', pglite },
      leagues: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
      close: () => pglite.close(),
    };
  } catch (error) {
    await pglite.close();
    throw error;
  }
}
