// countLiveGames (step 2.95, T-158) on made-up PGlite databases (T-201): none before the
// games table exists, none on a newly made schema, and only the games marked live.
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { countLiveGames } from './count-live-games.ts';

describe('countLiveGames', () => {
  it('is 0 on a database that has no games table yet', async () => {
    const db = new PGlite();
    try {
      expect(await countLiveGames(pgliteDriver(db))).toBe(0);
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
      expect(await countLiveGames(driver)).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('counts the games marked live only, whichever league they are in', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.games (league_id int not null, status text not null);
        insert into public.games values
          (1, 'live'), (2, 'live'), (2, 'final'), (3, 'scheduled'), (3, 'live'), (1, 'postponed');
      `);
      expect(await countLiveGames(pgliteDriver(db))).toBe(3);
    } finally {
      await db.close();
    }
  });
});
