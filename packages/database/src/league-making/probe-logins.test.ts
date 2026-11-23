// What each login may do, on PGlite only (T-201). PGlite has one session, so each case
// takes another role for the whole session (set session authorization), standing in for
// a login of that kind, and gives it back afterwards.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { pgliteDriver } from '../migrations/index.ts';
import { freshSchema } from '../schema/schema.test-helper.ts';
import type { LeagueMakingTarget } from './league-making-target.ts';
import { appLoginProblems, migrationLoginGaps, probeLogins } from './probe-logins.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  await pglite.exec(`
    create role made_up_app_login login;
    grant app_user to made_up_app_login;
    create role made_up_stranger login;
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterEach(async () => {
  // PGlite does not take "reset session authorization" back; naming the superuser does.
  await pglite.exec('set session authorization postgres');
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const target = (appLogin: 'own' | 'shared'): LeagueMakingTarget => ({
  login: { ...pgliteDriver(pglite), close: async () => {} },
  db,
  appLogin,
  place: { kind: 'memory' },
  freshLogin: async () => ({ ...pgliteDriver(pglite), close: async () => {} }),
  close: async () => {},
});
const actAs = (role: string) => pglite.exec(`set session authorization ${role}`);

describe('the app’s own login', () => {
  it('passes as a member of app_user that can become app_user', async () => {
    await actAs('made_up_app_login');
    expect(await appLoginProblems(target('own'))).toEqual([]);
  });

  it('is refused as a superuser or a stranger to app_user, in checkLoginRole’s words', async () => {
    expect(await appLoginProblems(target('own'))).toContain(
      'postgres is a superuser: alter role postgres nosuperuser',
    );
    await actAs('made_up_stranger');
    expect(await appLoginProblems(target('own'))).toEqual([
      'made_up_stranger is not app_user and cannot become it: grant app_user to made_up_stranger',
    ]);
  });
});

describe('the migration login', () => {
  it('passes as the tables’ owner, which sees past the accounts’ fence', async () => {
    expect(await migrationLoginGaps(pgliteDriver(pglite))).toEqual([]);
  });

  it('is refused as the app’s login: it cannot find accounts by email or read the migration log', async () => {
    await actAs('made_up_app_login');
    const gaps = await migrationLoginGaps(pgliteDriver(pglite));
    expect(gaps).toContain('sees-past-fence');
    expect(gaps).toContain('accounts');
    expect(gaps).toContain('migration-log');
  });
});

describe('probeLogins', () => {
  it('asks the app’s login only when the commands run under a login of their own', async () => {
    // On PGlite one superuser does both: nothing to refuse.
    expect(await probeLogins(target('shared'))).toEqual([]);
    // As a hosted target, the same superuser is refused as the app's login.
    expect(await probeLogins(target('own'))).toEqual([
      {
        login: 'app',
        problems: expect.arrayContaining([
          'postgres is a superuser: alter role postgres nosuperuser',
        ]),
      },
    ]);
  });
});
