// The made-up database the apps run on locally and in their tests: the seed leagues,
// used as a login fit for the app (T-60), behind the league fence like a hosted one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkLoginRole } from '../db/check-login-role.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { leaguesStore } from '../stores/index.ts';
import { madeUpDatabase, type MadeUpDatabase } from './made-up-database.ts';
import { seedLeagues } from './seed-data.ts';

let made: MadeUpDatabase;
let db: DatabaseHandle;
beforeAll(async () => {
  made = await madeUpDatabase();
  db = createDatabase(made.source);
}, 60_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

describe('madeUpDatabase', () => {
  it('holds every seed league, with its owner', () => {
    expect(made.leagues.map((league) => league.slug)).toEqual(
      seedLeagues.map((league) => league.slug).sort(),
    );
    for (const league of made.leagues) {
      expect(league.leagueId).toMatch(/^[0-9a-f-]{36}$/);
      expect(league.ownerAccountId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('is used as a login the app accepts at start-up', async () => {
    expect(await checkLoginRole(db)).toEqual([]);
  });

  it('keeps each league behind its fence', async () => {
    const [first, second] = made.leagues;
    if (first === undefined || second === undefined) throw new Error('two seed leagues expected');
    const seen = await withTransaction(db, { leagueId: first.leagueId }, (scope) =>
      leaguesStore(scope).currentLeague(),
    );
    expect(seen?.id).toBe(first.leagueId);
    expect(seen?.id).not.toBe(second.leagueId);
  });

  it('puts the seed leagues asked for in the bin, and refuses a name it does not hold', async () => {
    const [first, second] = made.leagues;
    if (first === undefined || second === undefined) throw new Error('two seed leagues expected');
    const binned = await madeUpDatabase({ inBin: [first.slug] });
    const binnedDb = createDatabase(binned.source);
    try {
      const current = (leagueId: string) =>
        withTransaction(binnedDb, { leagueId }, (scope) => leaguesStore(scope).currentLeague());
      const ids = new Map(binned.leagues.map((league) => [league.slug, league.leagueId]));
      expect(await current(ids.get(first.slug) ?? '')).toBeUndefined();
      expect((await current(ids.get(second.slug) ?? ''))?.slug).toBe(second.slug);
      expect(await checkLoginRole(binnedDb)).toEqual([]);
    } finally {
      await binnedDb.close();
      await binned.close();
    }
    await expect(madeUpDatabase({ inBin: ['no-such-league'] })).rejects.toThrow(/no seed league/);
  }, 60_000);
});
