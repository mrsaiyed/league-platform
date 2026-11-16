// listLeagueSeasons lists every season of the league in scope that is not in the bin, the
// public ones first, each with its program, and only that league's (T-28).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { transactionOf, type AppScope, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newLeague,
  newProgram,
  newSeason,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listLeagueSeasons } from './list-league-seasons.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let otherProgram: string;
const ids: Record<string, string> = {};

async function season(
  leagueId: string,
  programId: string,
  slug: string,
  name: string,
  set: { status?: string; startsOn?: string; isCurrent?: boolean; binned?: boolean } = {},
) {
  const id = await newSeason(pglite, leagueId, programId, {
    slug,
    isCurrent: set.isCurrent ?? false,
  });
  await pglite.query(
    `update seasons set name = $2, status = $3, starts_on = $4,
       deleted_at = case when $5 then now() end
     where id = $1`,
    [id, name, set.status ?? 'draft', set.startsOn ?? null, set.binned ?? false],
  );
  ids[slug] = id;
  return id;
}

beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  otherProgram = await newProgram(pglite, a.leagueId, 'camp');
  const binnedProgram = await newProgram(pglite, a.leagueId, 'old');
  await season(a.leagueId, a.defaultProgramId, 'fall', 'Fall', {
    status: 'completed',
    startsOn: '2026-09-01',
  });
  await season(a.leagueId, a.defaultProgramId, 'winter', 'Winter', {
    status: 'active',
    startsOn: '2026-12-01',
    isCurrent: true,
  });
  await season(a.leagueId, a.defaultProgramId, 'undated', 'Undated', { status: 'active' });
  await season(a.leagueId, a.defaultProgramId, 'spring', 'Spring');
  await season(a.leagueId, otherProgram, 'camp-2027', 'Camp 2027');
  await season(a.leagueId, a.defaultProgramId, 'binned', 'Binned', { binned: true });
  await season(a.leagueId, binnedProgram, 'old-season', 'Old Season', { status: 'active' });
  await pglite.query('update programs set deleted_at = now() where id = $1', [binnedProgram]);
  await season(b.leagueId, b.defaultProgramId, 'other-winter', 'Other Winter', {
    status: 'active',
  });
  await season(b.leagueId, b.defaultProgramId, 'other-hidden', 'Other Hidden');
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const listed = (rows: readonly { slug: string }[]) => rows.map((r) => r.slug);

describe('listLeagueSeasons', () => {
  it('lists the public seasons newest first, then the ones not public yet by name', async () => {
    const rows = await withTransaction(db, { leagueId: a.leagueId }, listLeagueSeasons);
    expect(listed(rows)).toEqual(['winter', 'fall', 'undated', 'camp-2027', 'spring']);
    expect(rows[0]).toEqual({
      id: ids['winter'],
      slug: 'winter',
      name: 'Winter',
      programId: a.defaultProgramId,
      isCurrent: true,
      isPublic: true,
    });
    expect(rows.map((r) => r.isPublic)).toEqual([true, true, true, false, false]);
    // Each says its program, the rule of who may be told of it (mayListSeason) needs it.
    expect(rows.find((r) => r.slug === 'camp-2027')?.programId).toBe(otherProgram);
  });

  it('leaves out a season in the bin, and every season of a program in the bin', async () => {
    const rows = await withTransaction(db, { leagueId: a.leagueId }, listLeagueSeasons);
    expect(listed(rows)).not.toContain('binned');
    expect(listed(rows)).not.toContain('old-season');
  });

  it("never returns another league's seasons", async () => {
    const rows = await withTransaction(db, { leagueId: b.leagueId }, listLeagueSeasons);
    expect(listed(rows)).toEqual(['other-winter', 'other-hidden']);
  });

  it('filters to the league itself, with row-level security out of the way (T-28)', async () => {
    const result = await withUnfencedScope(db, a.leagueId, async (scope) => ({
      everything: await transactionOf(scope).selectFrom('seasons').select('league_id').execute(),
      listed: await listLeagueSeasons(scope),
    }));
    // The unfenced transaction does see league B, so only the query's filter keeps it out.
    expect(result.everything.some((row) => row.league_id === b.leagueId)).toBe(true);
    expect(listed(result.listed)).toEqual(['winter', 'fall', 'undated', 'camp-2027', 'spring']);
  });

  it('cannot be called without a league scope (T-28)', () => {
    expectTypeOf(listLeagueSeasons).parameter(0).toEqualTypeOf<LeagueScope>();
    // Never run: these lines are here for the type check, which must refuse each.
    const refused = [
      // @ts-expect-error no scope at all
      () => listLeagueSeasons(),
      // @ts-expect-error a plain object with a league ID is not a scope
      () => listLeagueSeasons({ leagueId: a.leagueId, accountId: null }),
      // @ts-expect-error a transaction opened with no league is not a LeagueScope
      (scope: AppScope) => listLeagueSeasons(scope),
    ];
    expect(refused).toHaveLength(3);
  });
});
