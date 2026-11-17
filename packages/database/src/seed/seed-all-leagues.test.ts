// What `npm run seed` loads (seed-all-leagues.ts): every seed league, its season under way
// and its tracked game, in one go; a second run leaves everything alone; a load that
// stopped part-way is never called "Already there".
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { seedAllLeaguesInto } from './seed-all-leagues.ts';
import { seedLeagues } from './seed-data.ts';
import { seedLeaguesInto } from './seed-leagues.ts';

const fresh = async () => {
  const db = new PGlite();
  const run = await applyMigrations(pgliteDriver(db));
  if (!run.ok) throw new Error(run.error.message);
  return db;
};

/** Everything the load writes, counted per league, to show a rerun changes nothing. */
async function counts(db: PGlite) {
  const out: Record<string, unknown> = {};
  for (const table of [
    'leagues',
    'seasons',
    'teams',
    'people',
    'roster_entries',
    'venues',
    'games',
    'game_events',
    'player_game_stats',
    'standings_rows',
    'activity_log',
  ]) {
    out[table] = (
      await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)
    ).rows[0]!.n;
  }
  return out;
}

let pglite: PGlite;
beforeAll(async () => {
  pglite = await fresh();
}, 120_000);
afterAll(async () => {
  await pglite.close();
});

describe('seedAllLeaguesInto', () => {
  it('loads every seed league with its season under way, its venue and its tracked game', async () => {
    const loaded = await seedAllLeaguesInto(pglite);
    expect(loaded).toEqual(
      seedLeagues.map((league) => ({ slug: league.slug, name: league.name, created: true })),
    );
    for (const league of seedLeagues) {
      const { rows } = await pglite.query<{ games: number; finals: number; tracked: number }>(
        `select count(*)::int as games,
           count(*) filter (where games.status = 'final')::int as finals,
           count(*) filter (where exists (
             select 1 from game_events where game_events.game_id = games.id))::int as tracked
         from games join leagues on leagues.id = games.league_id where leagues.slug = $1`,
        [league.slug],
      );
      expect(rows[0]).toEqual({
        games: league.divisions.length * 2 + 1,
        finals: league.divisions.length + 1,
        tracked: 1,
      });
    }
  }, 120_000);

  it('leaves everything alone when run again', async () => {
    const before = await counts(pglite);
    const again = await seedAllLeaguesInto(pglite);
    expect(again.map((league) => league.created)).toEqual(seedLeagues.map(() => false));
    expect(await counts(pglite)).toEqual(before);
  }, 120_000);

  it('stops with a plain message on a league loaded only part-way', async () => {
    const partial = await fresh();
    try {
      // The leagues are there, but their seasons were never put under way.
      await seedLeaguesInto(partial);
      await expect(seedAllLeaguesInto(partial)).rejects.toThrow(/only partly loaded/);
    } finally {
      await partial.close();
    }
  }, 120_000);
});
