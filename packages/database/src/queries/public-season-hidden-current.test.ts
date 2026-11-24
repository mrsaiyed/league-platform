// S-103 (step 2.130): an admin may make a hidden season the current one, to prepare it on
// their own screens, while visitors go on seeing the season that is shown. The public
// reads that start from "the current season" use it only while it is shown, and otherwise
// the most recent shown season of the program; with no shown season they find nothing.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newGame,
  newLeague,
  newSeason,
  newStage,
  newTeam,
  unique,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { findPublicSeason } from './find-public-season.ts';
import { listPublicSchedule } from './list-public-schedule.ts';
import { listPublicSeasons } from './list-public-seasons.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let league: MadeLeague;
let empty: MadeLeague;
let fall: string;

beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  league = await newLeague(pglite, unique('pub'));
  const L = league.leagueId;
  const old = await newSeason(pglite, L, league.defaultProgramId, { slug: 'fall-2025' });
  fall = await newSeason(pglite, L, league.defaultProgramId, { slug: 'fall-2026' });
  const next = await newSeason(pglite, L, league.defaultProgramId, {
    slug: 'winter-2027',
    isCurrent: true,
  });
  await pglite.query(
    `update seasons set status = 'completed', starts_on = '2025-09-01' where id = $1`,
    [old],
  );
  await pglite.query(
    `update seasons set status = 'active', starts_on = '2026-09-01' where id = $1`,
    [fall],
  );
  // The hidden current season starts later: it must still not be what visitors see.
  await pglite.query(`update seasons set starts_on = '2027-01-05' where id = $1`, [next]);
  const stageId = await newStage(pglite, L, fall);
  await newGame(pglite, {
    leagueId: L,
    seasonId: fall,
    stageId,
    homeTeamId: await newTeam(pglite, L, fall),
    awayTeamId: await newTeam(pglite, L, fall),
  });
  // A league whose only season, its current one, is hidden.
  empty = await newLeague(pglite, unique('pub'));
  await newSeason(pglite, empty.leagueId, empty.defaultProgramId, { isCurrent: true });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const inLeague = <T>(made: MadeLeague, work: (scope: LeagueScope) => Promise<T>) =>
  withTransaction(db, { leagueId: made.leagueId }, work);

describe('a hidden current season is not what visitors see (S-103)', () => {
  it('opens the public pages on the most recent shown season instead', async () => {
    const found = await inLeague(league, (scope) => findPublicSeason(scope));
    expect(found?.slug).toBe('fall-2026');
    expect(found?.isCurrent).toBe(false);
    // The public season list the home page, schedule and standings choose from.
    const seasons = await inLeague(league, (scope) => listPublicSeasons(scope));
    expect(seasons.map((s) => s.slug)).toEqual(['fall-2026', 'fall-2025']);
    const schedule = await inLeague(league, (scope) =>
      listPublicSchedule(scope, fall, '2026-11-24'),
    );
    expect(schedule?.season.slug).toBe('fall-2026');
  });

  it('finds nothing when no season is shown, as before', async () => {
    expect(await inLeague(empty, (scope) => findPublicSeason(scope))).toBeUndefined();
    expect(await inLeague(empty, (scope) => listPublicSeasons(scope))).toEqual([]);
  });
});
