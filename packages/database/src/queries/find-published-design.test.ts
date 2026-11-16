// findPublishedDesign reads the scope's league's latest site release, inside the league
// fence, and nothing of another league's (step 2.187, record 073).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, type MadeLeague } from '../schema/schema.test-helper.ts';
import { findPublishedDesign } from './find-published-design.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let none: MadeLeague;

const release = (league: MadeLeague, number: number, design: object, start = 'crest') =>
  pglite.query(
    `insert into site_releases (league_id, number, starting_design, design, published_by_account_id)
     values ($1, $2, $3, $4::jsonb, $5)`,
    [league.leagueId, number, start, JSON.stringify(design), league.ownerId],
  );

beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  none = await newLeague(pglite);
  await release(a, 1, { version: 1, mark: 'a-first' });
  await release(a, 2, { version: 1, mark: 'a-latest' }, 'crest-light');
  // B's release is numbered past A's, so a read that forgot its league would find it.
  await release(b, 7, { version: 1, mark: 'b-only' }, 'midnight-gold');
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('findPublishedDesign', () => {
  it("reads the league's latest release: its number, starting design and design", async () => {
    expect(await withTransaction(db, { leagueId: a.leagueId }, findPublishedDesign)).toEqual({
      number: 2,
      startingDesign: 'crest-light',
      design: { version: 1, mark: 'a-latest' },
    });
    expect(
      await withTransaction(db, { leagueId: b.leagueId }, findPublishedDesign, {
        snapshot: 'page',
      }),
    ).toMatchObject({ number: 7, design: { mark: 'b-only' } });
  });

  it('finds nothing for a league with no release, even past the fence', async () => {
    expect(await withTransaction(db, { leagueId: none.leagueId }, findPublishedDesign)).toBe(
      undefined,
    );
    // Past row-level security only its own league filter keeps the others out.
    expect(await withUnfencedScope(db, none.leagueId, findPublishedDesign)).toBeUndefined();
    expect(await withUnfencedScope(db, a.leagueId, findPublishedDesign)).toMatchObject({
      number: 2,
    });
  });
});
