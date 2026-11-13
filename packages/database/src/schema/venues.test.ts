// T3 §4: venues belong to a league, and a court belongs to one venue of the same
// league for good. Names are unique where the fixture import matches by name.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema, newCourt, newLeague, newVenue, refused } from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

describe('venues', () => {
  it('have names unique in their league, whatever the capitals, while not in the bin', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const gym = await newVenue(db, a.leagueId, 'Main Gym');
    await expect(newVenue(db, a.leagueId, 'main gym ')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'venues_name_key',
    });
    await newVenue(db, b.leagueId, 'Main Gym');
    await db.query('update venues set deleted_at = now() where id = $1', [gym]);
    await newVenue(db, a.leagueId, 'Main Gym');
  });

  it('have a name of 1 to 120 characters', async () => {
    const { leagueId } = await newLeague(db);
    await newVenue(db, leagueId, 'v'.repeat(120));
    for (const name of ['', '  ', 'v'.repeat(121)]) {
      await expect(newVenue(db, leagueId, name)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'venues_name_length',
      });
    }
  });

  it('have an address of up to 300 characters, or none', async () => {
    const { leagueId } = await newLeague(db);
    const venue = await newVenue(db, leagueId);
    const address = (text: string | null) =>
      db.query('update venues set address = $1 where id = $2', [text, venue]);
    await address('1 Made-up Street, Springfield');
    await address('a'.repeat(300));
    await address(null);
    for (const text of ['', ' ', 'a'.repeat(301)]) {
      await expect(address(text)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'venues_address_length',
      });
    }
  });

  it('have a map link that is an https address, or none', async () => {
    const { leagueId } = await newLeague(db);
    const venue = await newVenue(db, leagueId);
    const link = (text: string | null) =>
      db.query('update venues set map_link = $1 where id = $2', [text, venue]);
    await link('https://maps.example.test/place?q=gym');
    await link(null);
    for (const text of [
      'http://maps.example.test/',
      'javascript:alert(1)',
      'https://',
      'https://maps.example.test/a place',
      `https://maps.example.test/${'x'.repeat(2000)}`,
    ]) {
      await expect(link(text)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'venues_map_link_format',
      });
    }
  });
});

describe('courts', () => {
  it("cannot point at another league's venue (T-40)", async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    await newCourt(db, a.leagueId, await newVenue(db, a.leagueId));
    const theirs = await newVenue(db, b.leagueId);
    await expect(newCourt(db, a.leagueId, theirs)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'courts_venue',
    });
  });

  it('never move to another venue', async () => {
    const { leagueId } = await newLeague(db);
    const court = await newCourt(db, leagueId, await newVenue(db, leagueId));
    const other = await newVenue(db, leagueId);
    await expect(
      db.query('update courts set venue_id = $1 where id = $2', [other, court]),
    ).rejects.toMatchObject(refused.restrict);
  });

  it('have names unique at their venue, whatever the capitals, while not in the bin', async () => {
    const { leagueId } = await newLeague(db);
    const gym = await newVenue(db, leagueId);
    const hall = await newVenue(db, leagueId);
    const first = await newCourt(db, leagueId, gym, 'Court 1');
    await expect(newCourt(db, leagueId, gym, 'COURT 1')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'courts_name_key',
    });
    await newCourt(db, leagueId, hall, 'Court 1');
    await db.query('update courts set deleted_at = now() where id = $1', [first]);
    await newCourt(db, leagueId, gym, 'Court 1');
  });

  it('have a name of 1 to 120 characters and a sort from 0 to 100000', async () => {
    const { leagueId } = await newLeague(db);
    const venue = await newVenue(db, leagueId);
    for (const name of ['', ' ', 'c'.repeat(121)]) {
      await expect(newCourt(db, leagueId, venue, name)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'courts_name_length',
      });
    }
    const court = await newCourt(db, leagueId, venue, 'c'.repeat(120));
    const sort = (n: number) => db.query('update courts set sort = $1 where id = $2', [n, court]);
    await sort(0);
    await sort(100000);
    for (const n of [-1, 100001]) {
      await expect(sort(n)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'courts_sort_range',
      });
    }
  });
});
