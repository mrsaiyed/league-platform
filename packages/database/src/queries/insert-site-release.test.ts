// insertSiteRelease writes a release of the scope's league and points its site at it, as
// the app's role through the fence (step 2.187, record 073).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, one, type MadeLeague } from '../schema/schema.test-helper.ts';
import { insertSiteRelease } from './insert-site-release.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const publish = (league: MadeLeague, number: number, startingDesign: string) =>
  withTransaction(db, { leagueId: league.leagueId, accountId: league.ownerId }, (scope) =>
    insertSiteRelease(scope, {
      number,
      startingDesign,
      design: { version: 1, start: startingDesign },
      publishedByAccountId: league.ownerId,
    }),
  );

const siteOf = (league: MadeLeague) =>
  one<{ starting_design: string; design_draft: unknown; published: number; version: number }>(
    pglite,
    `select s.starting_design, s.design_draft, r.number as published, s.version
     from sites s join site_releases r on r.id = s.published_release_id
     where s.league_id = $1`,
    [league.leagueId],
  );

describe('insertSiteRelease', () => {
  it('makes the site with the first release, then points it at each new one', async () => {
    const first = await publish(a, 1, 'crest');
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await siteOf(a)).toEqual({
      starting_design: 'crest',
      design_draft: { version: 1, start: 'crest' },
      published: 1,
      version: 1,
    });
    await publish(a, 2, 'crest-light');
    expect(await siteOf(a)).toEqual({
      starting_design: 'crest-light',
      design_draft: { version: 1, start: 'crest-light' },
      published: 2,
      version: 2,
    });
    expect(
      await one(pglite, 'select count(*)::int as n from sites where league_id = $1', [a.leagueId]),
    ).toEqual({ n: 1 });
  });

  it('answers number-taken for a number its league has, and another league has its own', async () => {
    expect(await publish(a, 2, 'crest')).toBe('number-taken');
    expect(await siteOf(a)).toMatchObject({ published: 2, starting_design: 'crest-light' });
    // B's first release is its own number 1, not taken by A's.
    expect(await publish(b, 1, 'midnight-gold')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await siteOf(b)).toMatchObject({ published: 1, starting_design: 'midnight-gold' });
  });
});
