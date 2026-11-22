// countLiveGames (step 2.95, T-158) on made-up PGlite databases (T-201): none before the
// games table exists, none on a newly made schema, only the games marked live, and a
// login fenced by row-level security refused, never counted as 0.
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { countLiveGames } from './count-live-games.ts';

const standIn = `
  create table public.games (league_id int not null, status text not null);
  insert into public.games values
    (1, 'live'), (2, 'live'), (2, 'final'), (3, 'scheduled'), (3, 'live'), (1, 'postponed');
`;

describe('countLiveGames', () => {
  it('is 0 on a database that has no games table yet', async () => {
    const db = new PGlite();
    try {
      expect(await countLiveGames(pgliteDriver(db))).toEqual({ ok: true, live: 0 });
    } finally {
      await db.close();
    }
  });

  it('is 0 on every migration applied and no game played', async () => {
    const db = new PGlite();
    try {
      const driver = pgliteDriver(db);
      const run = await applyMigrations(driver);
      expect(run.ok).toBe(true);
      expect(await countLiveGames(driver)).toEqual({ ok: true, live: 0 });
    } finally {
      await db.close();
    }
  });

  it('counts the games marked live only, whichever league they are in', async () => {
    const db = new PGlite();
    try {
      await db.exec(standIn);
      expect(await countLiveGames(pgliteDriver(db))).toEqual({ ok: true, live: 3 });
    } finally {
      await db.close();
    }
  });

  it('refuses a login that row-level security fences, instead of counting 0', async () => {
    const db = new PGlite();
    try {
      // As migration 0009 has it: FORCE row-level security, and no policy for this login.
      await db.exec(`
        ${standIn}
        alter table public.games enable row level security;
        alter table public.games force row level security;
        create role made_up_fenced nologin nobypassrls;
        grant select on public.games to made_up_fenced;
        set role made_up_fenced;
      `);
      const fenced = await db.query<{ live: number }>(
        `select count(*)::int as live from public.games where status = 'live'`,
      );
      expect(fenced.rows[0]?.live).toBe(0);
      expect(await countLiveGames(pgliteDriver(db))).toEqual({
        ok: false,
        problem: 'fenced-login',
      });
      // A role that bypasses the fence sees them again.
      await db.exec(`reset role; create role made_up_owner nologin bypassrls;
        grant select on public.games to made_up_owner; set role made_up_owner;`);
      expect(await countLiveGames(pgliteDriver(db))).toEqual({ ok: true, live: 3 });
    } finally {
      await db.close();
    }
  });
});
