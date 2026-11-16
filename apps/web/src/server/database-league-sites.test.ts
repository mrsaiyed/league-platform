// Each league's name and design on the made-up database (step 2.93 part 3, record 070;
// step 2.187, record 073): the name its owner gave it, and the design of its latest
// published release, checked again before it is drawn; the neutral design for a league
// with none, and for one whose stored design does not pass, which is reported.
import { createLeague, planNewLeague, type NewLeaguePlan } from '@srleagues/core';
import * as database from '@srleagues/database';
import { designToCssText, startingDesign } from '@srleagues/site';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseLeagueSites, designNotDrawn } from './database-league-sites.ts';
import { siteOf, type LeagueSiteLookup } from './league-site.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let sites: LeagueSiteLookup;
let reports: { message: string; fields: object }[];
let clock: number;

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  reports = [];
  clock = Date.UTC(2026, 10, 16, 12);
  sites = databaseLeagueSites(database, db, {
    report: (message, fields) => reports.push({ message, fields }),
    now: () => clock,
  });
}, 120_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

const seedLeague = (slug: string) => {
  const league = made.leagues.find((l) => l.slug === slug);
  if (league === undefined) throw new Error(`no ${slug}`);
  return { id: league.leagueId, slug: league.slug, ownerAccountId: league.ownerAccountId };
};

let nextNumber = 10;
/**
 * Stores a release of the league holding `design`, whatever it is, through the database's
 * own write and not the command, as a document of an older shape or one written past the
 * command would be there: its number.
 */
async function storeRelease(league: { id: string; ownerAccountId: string }, design: unknown) {
  const number = nextNumber++;
  const stored = await database.withTransaction(
    db,
    { leagueId: league.id, accountId: league.ownerAccountId },
    (scope) =>
      database.insertSiteRelease(scope, {
        number,
        startingDesign: 'crest',
        design: JSON.parse(JSON.stringify(design)) as database.NewSiteReleaseRow['design'],
        publishedByAccountId: league.ownerAccountId,
      }),
  );
  if (stored === 'number-taken') throw new Error(`release ${number} is taken`);
  return number;
}

describe('databaseLeagueSites', () => {
  it('names each seed league by its own name, drawn in its own starting design', async () => {
    const designs = new Set<string>();
    for (const seed of database.seedLeagues) {
      const site = await siteOf(seedLeague(seed.slug), sites);
      expect(site.name).toBe(seed.name);
      expect(site.design).toEqual(startingDesign(seed.design));
      designs.add(site.design.colors.primary);
    }
    // The seed's leagues look different from one another, and neither is the neutral one.
    expect(designs.size).toBe(database.seedLeagues.length);
    expect(designs.has(startingDesign('clean-court').colors.primary)).toBe(false);
    expect(reports).toEqual([]);
  });

  /**
   * Makes a league by the product's own command as our staff: a seed owner's account
   * stands in for one, told it is staff for this one store. With `design`, as the
   * league-making tool passes its plan's.
   */
  async function makeLeagueAsStaff(
    id: string,
    slug: string,
    name: string,
    design?: NewLeaguePlan['design'],
  ) {
    const staff = seedLeague('lakeside').ownerAccountId;
    const transaction = database.commandTransaction(db, (scope) => ({
      jobs: database.jobsStore(scope),
      leagues: database.leaguesStore(scope, { platformStaff: [staff] }),
      divisions: database.divisionsStore(scope),
      access: database.accessStore(scope),
      activity: database.activityLogStore(scope),
    }));
    return createLeague(
      { leagueId: id, accountId: staff, requestId: slug },
      {
        slug,
        name,
        timeZone: 'America/Chicago',
        audience: 'adult',
        ownerAccountId: staff,
        sportKey: 'basketball',
        ...(design === undefined
          ? {}
          : { design: { startingDesign: design.startingDesign, colors: design.colors } }),
      },
      { transaction, events: [], log: () => {}, now: () => 0 },
    );
  }

  it('draws a league with no release in the neutral design', async () => {
    // Made by the command with no design, as a test or the seed may: no release.
    const id = '01900000-0000-7000-8000-00000000f001';
    expect((await makeLeagueAsStaff(id, 'no-design-yet', 'No Design Yet League')).ok).toBe(true);
    const site = await siteOf({ id, slug: 'no-design-yet' }, sites);
    expect(site).toEqual({ name: 'No Design Yet League', design: startingDesign('clean-court') });
    expect(reports).toEqual([]);
  });

  it('draws a league the tool made with no design named in the first starting design, crest (C-16)', async () => {
    // The league-making tool's own plan, no design named: what it passes the command.
    const planned = planNewLeague({
      name: 'Tool Made League',
      shortName: 'tool-made',
      sport: 'basketball',
      whoPlays: 'adults',
      city: 'Springfield',
      timeZone: 'America/Chicago',
      contactEmail: 'hello@example.test',
      ownerEmail: 'owner@example.test',
      seasonName: 'Fall 2026',
      staffEmail: 'staff@example.test',
    });
    if (!planned.ok) throw new Error(JSON.stringify(planned.problems));
    const id = '01900000-0000-7000-8000-00000000f002';
    const made = await makeLeagueAsStaff(id, 'tool-made', 'Tool Made League', planned.plan.design);
    expect(made.ok).toBe(true);
    const site = await siteOf({ id, slug: 'tool-made' }, sites);
    expect(site.design).toEqual(startingDesign('crest'));
    expect(designToCssText(site.design)).toContain('--color-primary: #96062d;');
    expect(site.design.colors.primary).not.toBe(startingDesign('clean-court').colors.primary);
    expect(reports).toEqual([]);
  });

  it('never draws a stored value the schema does not allow: the neutral design, reported once an hour', async () => {
    const league = seedLeague('maple-street');
    const own = startingDesign(
      database.seedLeagues.find((l) => l.slug === 'maple-street')?.design ?? 'crest',
    );
    const hostile: unknown[] = [
      { ...own, colors: { ...own.colors, primary: 'red; } body { display:none' } },
      { ...own, colors: { ...own.colors, accent: '</style><script>alert(1)</script>' } },
      { ...own, colors: { ...own.colors, background: 'url(http://example.test/x.png)' } },
      { ...own, colors: { ...own.colors, text: `#${'a'.repeat(5000)}` } },
      { ...own, fonts: { ...own.fonts, heading: "x'; } body { display:none" } },
      { ...own, corners: '0; } body { display:none' },
      // A document of an older or another shape.
      { version: 1, colors: { primary: '#123456' } },
      { ...own, version: 2 },
    ];
    for (const design of hostile) {
      reports = [];
      const number = await storeRelease(league, design);
      const site = await siteOf(league, sites);
      expect(site.design).toEqual(startingDesign('clean-court'));
      const css = designToCssText(site.design);
      for (const words of ['display:none', '</style>', 'url(', 'script', 'aaaaaaaa']) {
        expect(css).not.toContain(words);
      }
      expect(reports).toEqual([
        { message: designNotDrawn, fields: { leagueId: league.id, release: String(number) } },
      ]);
    }
    // Asked again within the hour: drawn the same, not reported again; after it, again.
    reports = [];
    await siteOf(league, sites);
    expect(reports).toEqual([]);
    clock += 61 * 60 * 1000;
    await siteOf(league, sites);
    expect(reports).toHaveLength(1);
    // A sound design published after it is drawn again.
    await storeRelease(league, startingDesign('crest-light'));
    expect((await siteOf(league, sites)).design).toEqual(startingDesign('crest-light'));
  });

  it('knows no league for an id that is not one, asking no database', async () => {
    expect(await sites('lakeside')).toBeUndefined();
    expect(await sites('01900000-0000-7000-8000-00000000dead')).toBeUndefined();
    expect((await siteOf({ id: 'lakeside', slug: 'lakeside' }, sites)).name).toBe('lakeside');
  });
});
