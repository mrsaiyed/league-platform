// Development-only (T-195, T-201): everything `npm run seed` loads into a local test
// database, in one go. The seed leagues (seed-data.ts) are loaded, their seasons put under
// way (seed-season-under-way.ts) and given their venue and one tracked game
// (seed-tracked-games.ts); then the demo-shaped league (seed-demo-league.ts). Made-up data
// only: it takes a PGlite, never an address.
//
// Safe to run again: a league already there is left alone. Each part runs its own
// commands, so a load that stopped part-way is found and stops with a plain message,
// never a false "Already there": start again from a fresh database.
import type { PGlite } from '@electric-sql/pglite';
import { seedLeagues } from './seed-data.ts';
import { seedDemoLeagueInto } from './seed-demo-league.ts';
import { seedLeaguesInto } from './seed-leagues.ts';
import { SeedPartlyLoaded } from './seed-partly-loaded.ts';
import { putSeedSeasonsUnderWay } from './seed-season-under-way.ts';
import { addSeedTrackedGames } from './seed-tracked-games.ts';

export type SeedLoad = {
  readonly slug: string;
  readonly name: string;
  /** False when the league was already there, whole, and was left alone. */
  readonly created: boolean;
};

/** Whether a seed league already there got as far as its tracked game, the last part. */
async function hasTrackedGame(pglite: PGlite, leagueId: string): Promise<boolean> {
  const { rows } = await pglite.query<{ n: number }>(
    `select count(*)::int as n from games
     where league_id = $1 and status = 'final' and capture_mode = 'live' and deleted_at is null
       and exists (select 1 from game_events where game_events.game_id = games.id)`,
    [leagueId],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Loads every seed league that is not there yet, its season under way and tracked. */
export async function seedAllLeaguesInto(
  pglite: PGlite,
  now: Date = new Date(),
): Promise<SeedLoad[]> {
  const loaded = await seedLeaguesInto(pglite);
  const made = loaded.filter((league) => league.created);
  if (made.length === loaded.length) {
    const slugs = made.map((league) => league.slug);
    await putSeedSeasonsUnderWay(pglite, now, slugs);
    await addSeedTrackedGames(pglite, now, slugs);
  } else if (made.length > 0) {
    throw new SeedPartlyLoaded(made[0]!.slug);
  } else {
    for (const league of loaded) {
      if (!(await hasTrackedGame(pglite, league.leagueId))) throw new SeedPartlyLoaded(league.slug);
    }
  }
  const seeded = loaded.map((league) => ({
    slug: league.slug,
    name: seedLeagues.find((l) => l.slug === league.slug)?.name ?? league.slug,
    created: league.created,
  }));
  return [...seeded, await seedDemoLeagueInto(pglite)];
}
