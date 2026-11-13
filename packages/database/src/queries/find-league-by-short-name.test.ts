// findLeagueByShortName answers, with no league set, which league a short name in an
// address names: current names, former ones still forwarding, and nothing more.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, unique, type MadeLeague } from '../schema/schema.test-helper.ts';
import { findLeagueByShortName } from './find-league-by-short-name.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
const aSlug = unique('north');
const bSlug = unique('south');
const formerSlug = unique('formerly');
const expiredSlug = unique('expired');
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite, aSlug);
  b = await newLeague(pglite, bSlug);
  await pglite.query(`update leagues set status = 'live' where id = $1`, [a.leagueId]);
  await pglite.query(
    `insert into league_slug_history (league_id, old_slug, created_at, expires_at)
     values ($1, $2, now(), now() + interval '1 month'),
            ($1, $3, now() - interval '13 months', now() - interval '1 day')`,
    [a.leagueId, formerSlug, expiredSlug],
  );
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** As the web app asks: a transaction with no league and no account set. */
const find = (slug: string) =>
  withTransaction(db, {}, (scope) => findLeagueByShortName(scope, slug));

describe('findLeagueByShortName (U-7, T-221)', () => {
  it('finds a league by its current short name, with no league set', async () => {
    expect(await find(aSlug)).toEqual({
      leagueId: a.leagueId,
      slug: aSlug,
      status: 'live',
      inBin: false,
      forwarded: false,
    });
    expect(await find(bSlug)).toMatchObject({ leagueId: b.leagueId, status: 'draft' });
  });

  it('finds a league by a former short name while it still forwards', async () => {
    expect(await find(formerSlug)).toEqual({
      leagueId: a.leagueId,
      slug: aSlug,
      status: 'live',
      inBin: false,
      forwarded: true,
    });
    expect(await find(expiredSlug)).toBeUndefined();
  });

  it('finds nothing for a name no league has, and matches exactly', async () => {
    expect(await find(unique('nobody'))).toBeUndefined();
    expect(await find(aSlug.toUpperCase())).toBeUndefined();
    expect(await find('')).toBeUndefined();
  });

  it('says when the league is in the bin', async () => {
    const binnedSlug = unique('binned');
    const binned = await newLeague(pglite, binnedSlug);
    await pglite.query('update leagues set deleted_at = now() where id = $1', [binned.leagueId]);
    expect(await find(binnedSlug)).toMatchObject({ leagueId: binned.leagueId, inBin: true });
  });

  it('works the same inside a league transaction, without revealing more', async () => {
    const found = await withTransaction(db, { leagueId: b.leagueId }, (scope) =>
      findLeagueByShortName(scope, aSlug),
    );
    expect(found).toMatchObject({ leagueId: a.leagueId, slug: aSlug });
  });
});
