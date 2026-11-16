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
import type { Audience } from '@srleagues/core';
import type { DatabaseSource } from '../db/create-database.ts';
import { applyMigrations } from '../migrations/apply-migrations.ts';
import { pgliteDriver } from '../migrations/pglite-driver.ts';
import { seedLeaguesInto } from './seed-leagues.ts';
import { putSeedSeasonsUnderWay } from './seed-season-under-way.ts';

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

export type MadeUpOptions = {
  /** Seed leagues, by short name, to put in the bin once loaded: for tests of the bin. */
  readonly inBin?: readonly string[];
  /**
   * Seed leagues, by short name, told another audience once loaded (who plays: adult,
   * youth or mixed, R-15): for the name scans of a league of mixed ages (T-81).
   */
  readonly audiences?: Readonly<Record<string, Audience>>;
  /**
   * Each seed league's season opened, with a published schedule and a result
   * (seed-season-under-way.ts): what the web app runs on locally, so its public pages
   * have something to show. Off by default: the seeded season is still being set up.
   */
  readonly underWay?: boolean;
};

/** Opens a new made-up database in memory. Close it when done. */
export async function madeUpDatabase(options: MadeUpOptions = {}): Promise<MadeUpDatabase> {
  const pglite = new PGlite();
  try {
    const run = await applyMigrations(pgliteDriver(pglite));
    if (!run.ok) throw new Error(`The made-up database could not be built: ${run.error.code}.`);
    await seedLeaguesInto(pglite);
    if (options.underWay === true) await putSeedSeasonsUnderWay(pglite);
    for (const [slug, audience] of Object.entries(options.audiences ?? {})) {
      const told = await pglite.query('update leagues set audience = $2 where slug = $1', [
        slug,
        audience,
      ]);
      if (told.affectedRows !== 1) {
        throw new Error('The made-up database has no seed league of one of those short names.');
      }
    }
    const inBin = options.inBin ?? [];
    if (inBin.length > 0) {
      const binned = await pglite.query(
        'update leagues set deleted_at = now() where slug = any($1::text[])',
        [inBin],
      );
      if (binned.affectedRows !== new Set(inBin).size) {
        throw new Error('The made-up database has no seed league of one of those short names.');
      }
    }
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
