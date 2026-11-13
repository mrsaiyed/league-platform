// Step 2.16's commands against the real database: divisions, venues and courts, each
// call one transaction (commandTransaction), committed on success and rolled back on a
// refusal. Covers the bin rules of record 019 (a removed row stays, with deleted_at;
// a parent is not binned over live children; a restore meets a name taken meanwhile)
// and the queries behind them. Their isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  createCourt,
  createDivision,
  createVenue,
  listDivisions,
  listVenues,
  removeCourt,
  removeDivision,
  removeVenue,
  reorderDivisions,
  restoreCourt,
  restoreDivision,
  restoreVenue,
  updateCourt,
  updateDivision,
  updateVenue,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type SchedulingTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newLeague,
  newSeason,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { schedulingStore } from './scheduling-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<LeaguesTx>;
let venueDeps: CommandDeps<SchedulingTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    leagues: leaguesStore(scope),
    divisions: divisionsStore(scope),
    scheduling: schedulingStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { events: [], log: () => {}, now: () => 0 };
  deps = { transaction, ...rest };
  venueDeps = { transaction, ...rest };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

type Made = MadeLeague & {
  seasonId: string;
  as: { leagueId: string; accountId: string; requestId: string };
};
async function league(): Promise<Made> {
  const made = await newLeague(pglite);
  const seasonId = await newSeason(pglite, made.leagueId, made.defaultProgramId);
  return {
    ...made,
    seasonId,
    as: { leagueId: made.leagueId, accountId: made.ownerId, requestId: 'r-1' },
  };
}

/** The value of a command that must have succeeded. */
function value<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value;
}
const codeOf = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? 'ok' : (result.error?.code ?? 'failed');

const divisionRow = (id: string) =>
  one<{ name: string; deleted_at: Date | null; sort: number; color: string | null }>(
    pglite,
    'select name, deleted_at, sort, color from divisions where id = $1',
    [id],
  );

describe('divisions', () => {
  it('adds, renames, colors and orders divisions, and lists them in order', async () => {
    const l = await league();
    const gold = value(await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, deps));
    const silver = value(
      await createDivision(l.as, { seasonId: l.seasonId, name: 'Silver', color: '#C0C0C0' }, deps),
    );
    expect((await divisionRow(silver.divisionId)).sort).toBe(1);
    value(
      await updateDivision(
        l.as,
        { divisionId: gold.divisionId, version: 1, name: 'Top', color: '#112233' },
        deps,
      ),
    );
    value(
      await reorderDivisions(
        l.as,
        { seasonId: l.seasonId, divisionIds: [silver.divisionId, gold.divisionId] },
        deps,
      ),
    );
    const listed = value(await listDivisions(l.as, { seasonId: l.seasonId }, deps));
    expect(listed.map((d) => [d.name, d.color])).toEqual([
      ['Silver', '#c0c0c0'],
      ['Top', '#112233'],
    ]);
    const log = await pglite.query<{ action: string }>(
      'select action from activity_log where league_id = $1 order by created_at, id',
      [l.leagueId],
    );
    expect(log.rows.map((r) => r.action).sort()).toEqual(
      [
        'leagues.create_division',
        'leagues.create_division',
        'leagues.reorder_divisions',
        'leagues.update_division',
      ].sort(),
    );
  });

  it('keeps a removed division as a row with deleted_at set, and restores it (A-5)', async () => {
    const l = await league();
    const { divisionId } = value(
      await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, deps),
    );
    value(await removeDivision(l.as, { divisionId }, deps));
    expect((await divisionRow(divisionId)).deleted_at).not.toBeNull();
    expect(value(await listDivisions(l.as, { seasonId: l.seasonId }, deps))).toEqual([]);
    value(await restoreDivision(l.as, { divisionId }, deps));
    expect((await divisionRow(divisionId)).deleted_at).toBeNull();
  });

  it('refuses a name a sibling has, in any capitals; a binned name is free', async () => {
    const l = await league();
    const gold = value(await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, deps));
    expect(codeOf(await createDivision(l.as, { seasonId: l.seasonId, name: ' GOLD ' }, deps))).toBe(
      'division-name-taken',
    );
    value(await removeDivision(l.as, { divisionId: gold.divisionId }, deps));
    expect(codeOf(await createDivision(l.as, { seasonId: l.seasonId, name: 'gold' }, deps))).toBe(
      'ok',
    );
  });

  it('refuses to restore onto a name taken meanwhile, and leaves it in the bin', async () => {
    const l = await league();
    const old = value(await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, deps));
    value(await removeDivision(l.as, { divisionId: old.divisionId }, deps));
    value(await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, deps));
    expect(codeOf(await restoreDivision(l.as, { divisionId: old.divisionId }, deps))).toBe(
      'division-name-taken',
    );
    expect((await divisionRow(old.divisionId)).deleted_at).not.toBeNull();
  });

  it('does not bin a division over live sub-divisions, nor restore a child under a binned parent', async () => {
    const l = await league();
    const east = value(await createDivision(l.as, { seasonId: l.seasonId, name: 'East' }, deps));
    const north = value(
      await createDivision(
        l.as,
        { seasonId: l.seasonId, parentDivisionId: east.divisionId, name: 'North' },
        deps,
      ),
    );
    expect(codeOf(await removeDivision(l.as, { divisionId: east.divisionId }, deps))).toBe(
      'division-has-subdivisions',
    );
    expect((await divisionRow(east.divisionId)).deleted_at).toBeNull();
    value(await removeDivision(l.as, { divisionId: north.divisionId }, deps));
    value(await removeDivision(l.as, { divisionId: east.divisionId }, deps));
    expect(codeOf(await restoreDivision(l.as, { divisionId: north.divisionId }, deps))).toBe(
      'division-parent-in-bin',
    );
    value(await restoreDivision(l.as, { divisionId: east.divisionId }, deps));
    value(await restoreDivision(l.as, { divisionId: north.divisionId }, deps));
    // A division cannot be put under one that is binned.
    value(await removeDivision(l.as, { divisionId: north.divisionId }, deps));
    value(await removeDivision(l.as, { divisionId: east.divisionId }, deps));
    expect(
      codeOf(
        await createDivision(
          l.as,
          { seasonId: l.seasonId, parentDivisionId: east.divisionId, name: 'West' },
          deps,
        ),
      ),
    ).toBe('parent-not-found');
  });

  it('refuses a stale save (T-46) and a parent from another season', async () => {
    const l = await league();
    const otherSeason = await newSeason(pglite, l.leagueId, l.defaultProgramId);
    const gold = value(await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, deps));
    value(
      await updateDivision(l.as, { divisionId: gold.divisionId, version: 1, name: 'First' }, deps),
    );
    expect(
      codeOf(
        await updateDivision(
          l.as,
          { divisionId: gold.divisionId, version: 1, name: 'Second' },
          deps,
        ),
      ),
    ).toBe('changed-since-read');
    expect(
      codeOf(
        await createDivision(
          l.as,
          { seasonId: otherSeason, parentDivisionId: gold.divisionId, name: 'Child' },
          deps,
        ),
      ),
    ).toBe('parent-not-found');
  });
});

describe('venues and courts', () => {
  it('adds a venue with courts, edits them, and lists them in order', async () => {
    const l = await league();
    const venue = value(
      await createVenue(
        l.as,
        { name: 'Main gym', address: '1 Court St', mapLink: 'https://maps.example.test/gym' },
        venueDeps,
      ),
    );
    const one1 = value(
      await createCourt(l.as, { venueId: venue.venueId, name: 'Court 1' }, venueDeps),
    );
    const two = value(
      await createCourt(l.as, { venueId: venue.venueId, name: 'Court 2' }, venueDeps),
    );
    value(await updateCourt(l.as, { courtId: one1.courtId, sort: 5 }, venueDeps));
    value(
      await updateVenue(
        l.as,
        { venueId: venue.venueId, version: 1, address: null, name: 'Big gym' },
        venueDeps,
      ),
    );
    const listed = value(await listVenues(l.as, {}, venueDeps));
    expect(listed.map((v) => [v.name, v.address, v.courts.map((c) => c.name)])).toEqual([
      ['Big gym', null, ['Court 2', 'Court 1']],
    ]);
    expect(one1.courtId).not.toBe(two.courtId);
  });

  it('refuses names taken among venues, and among one venue courts, whatever the capitals', async () => {
    const l = await league();
    const venue = value(await createVenue(l.as, { name: 'Main gym' }, venueDeps));
    expect(codeOf(await createVenue(l.as, { name: 'MAIN GYM' }, venueDeps))).toBe(
      'venue-name-taken',
    );
    value(await createCourt(l.as, { venueId: venue.venueId, name: 'Court 1' }, venueDeps));
    expect(
      codeOf(await createCourt(l.as, { venueId: venue.venueId, name: 'court 1' }, venueDeps)),
    ).toBe('court-name-taken');
    const other = value(await createVenue(l.as, { name: 'Annex' }, venueDeps));
    expect(
      codeOf(await createCourt(l.as, { venueId: other.venueId, name: 'Court 1' }, venueDeps)),
    ).toBe('ok');
  });

  it('keeps a removed venue or court as a row with deleted_at set (A-5), venue after its courts', async () => {
    const l = await league();
    const venue = value(await createVenue(l.as, { name: 'Main gym' }, venueDeps));
    const court = value(
      await createCourt(l.as, { venueId: venue.venueId, name: 'Court 1' }, venueDeps),
    );
    expect(codeOf(await removeVenue(l.as, { venueId: venue.venueId }, venueDeps))).toBe(
      'venue-has-courts',
    );
    value(await removeCourt(l.as, { courtId: court.courtId }, venueDeps));
    value(await removeVenue(l.as, { venueId: venue.venueId }, venueDeps));
    const rows = await pglite.query<{ deleted_at: Date | null }>(
      `select deleted_at from venues where id = $1
       union all select deleted_at from courts where id = $2`,
      [venue.venueId, court.courtId],
    );
    expect(rows.rows.map((r) => r.deleted_at !== null)).toEqual([true, true]);
    expect(value(await listVenues(l.as, {}, venueDeps))).toEqual([]);
    // The court cannot come back under a venue still in the bin.
    expect(codeOf(await restoreCourt(l.as, { courtId: court.courtId }, venueDeps))).toBe(
      'court-venue-in-bin',
    );
    value(await restoreVenue(l.as, { venueId: venue.venueId }, venueDeps));
    value(await restoreCourt(l.as, { courtId: court.courtId }, venueDeps));
    expect(value(await listVenues(l.as, {}, venueDeps))[0]?.courts).toHaveLength(1);
  });

  it('refuses to restore onto a name taken meanwhile', async () => {
    const l = await league();
    const venue = value(await createVenue(l.as, { name: 'Main gym' }, venueDeps));
    const court = value(
      await createCourt(l.as, { venueId: venue.venueId, name: 'Court 1' }, venueDeps),
    );
    value(await removeCourt(l.as, { courtId: court.courtId }, venueDeps));
    value(await createCourt(l.as, { venueId: venue.venueId, name: 'Court 1' }, venueDeps));
    expect(codeOf(await restoreCourt(l.as, { courtId: court.courtId }, venueDeps))).toBe(
      'court-name-taken',
    );
    // A venue binned and its name taken meanwhile, too.
    const annex = value(await createVenue(l.as, { name: 'Annex' }, venueDeps));
    value(await removeVenue(l.as, { venueId: annex.venueId }, venueDeps));
    value(await createVenue(l.as, { name: 'annex' }, venueDeps));
    expect(codeOf(await restoreVenue(l.as, { venueId: annex.venueId }, venueDeps))).toBe(
      'venue-name-taken',
    );
  });

  it('refuses a venue that moved on (T-46), a map link that is not https, and a missing court', async () => {
    const l = await league();
    const venue = value(await createVenue(l.as, { name: 'Main gym' }, venueDeps));
    value(await updateVenue(l.as, { venueId: venue.venueId, version: 1, name: 'A' }, venueDeps));
    expect(
      codeOf(await updateVenue(l.as, { venueId: venue.venueId, version: 1, name: 'B' }, venueDeps)),
    ).toBe('changed-since-read');
    expect(
      codeOf(await createVenue(l.as, { name: 'Bad', mapLink: 'javascript:alert(1)' }, venueDeps)),
    ).toBe('invalid-input');
    expect(
      codeOf(await updateCourt(l.as, { courtId: venue.venueId, version: 1, name: 'x' }, venueDeps)),
    ).toBe('court-not-found');
  });
});
