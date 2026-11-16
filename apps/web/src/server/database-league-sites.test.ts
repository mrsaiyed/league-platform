// Each league's name and design on the made-up database (step 2.93 part 3, record 070):
// the name its owner gave it, and the neutral starting design, since the database holds
// no design until the design editor's tables come.
import * as database from '@srleagues/database';
import { startingDesign } from '@srleagues/site';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseLeagueSites } from './database-league-sites.ts';
import { siteOf, type LeagueSiteLookup } from './league-site.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let sites: LeagueSiteLookup;

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  sites = databaseLeagueSites(database, db);
}, 120_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

describe('databaseLeagueSites', () => {
  it('names each seed league by its own name, with the neutral design', async () => {
    for (const seed of database.seedLeagues) {
      const league = made.leagues.find((l) => l.slug === seed.slug);
      if (league === undefined) throw new Error(`no ${seed.slug}`);
      const site = await siteOf({ id: league.leagueId, slug: league.slug }, sites);
      expect(site.name).toBe(seed.name);
      expect(site.design).toEqual(startingDesign('clean-court'));
    }
  });

  it('knows no league for an id that is not one, asking no database', async () => {
    expect(await sites('lakeside')).toBeUndefined();
    expect(await sites('01900000-0000-7000-8000-00000000dead')).toBeUndefined();
    expect((await siteOf({ id: 'lakeside', slug: 'lakeside' }, sites)).name).toBe('lakeside');
  });
});
