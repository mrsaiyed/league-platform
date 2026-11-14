// The public schedule, teams and roster queries (step 2.39): only what a visitor may
// see, in the order a page needs, with names only through the name function (T-81), and
// nothing private in any answer (T-29, R-16).
import type { PGlite } from '@electric-sql/pglite';
import {
  defaultNamePolicy,
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  type PublicDisplay,
  type ShownName,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newGame,
  newLeague,
  newPerson,
  newRosterEntry,
  newRound,
  newSeason,
  newStage,
  newTeam,
  one,
  unique,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { findPublicSeason } from './find-public-season.ts';
import { findPublicTeam } from './find-public-team.ts';
import { listPublicGames } from './list-public-games.ts';
import { listPublicRoster } from './list-public-roster.ts';
import { listPublicSchedule } from './list-public-schedule.ts';
import { listPublicSeasons } from './list-public-seasons.ts';
import { listPublicTeams } from './list-public-teams.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let league: MadeLeague;
let other: MadeLeague;
let seasonId: string;
let draftSeasonId: string;
let hawks: string;
let owls: string;
let draftTeam: string;
let display: PublicDisplay;

const people = {
  child: { first: 'Zuri', last: 'Mbeki', email: 'zuri.parent@example.test', born: '2012-03-04' },
  initials: { first: 'Layla', last: 'Hassan' },
  removed: { first: 'Omar', last: 'Farouk' },
  former: { first: 'Nadia', last: 'Petrov' },
};

beforeAll(async () => {
  pglite = await freshSchema();
  league = await newLeague(pglite, unique('pub'));
  other = await newLeague(pglite, unique('pub'));
  await pglite.query(
    "update leagues set audience = 'youth', time_zone = 'America/Chicago' where id = $1",
    [league.leagueId],
  );
  const L = league.leagueId;
  seasonId = await newSeason(pglite, L, league.defaultProgramId, {
    slug: 'fall-2026',
    isCurrent: true,
  });
  await pglite.query(
    "update seasons set status = 'active', starts_on = '2026-09-01' where id = $1",
    [seasonId],
  );
  const old = await newSeason(pglite, L, league.defaultProgramId, { slug: 'fall-2025' });
  await pglite.query(
    "update seasons set status = 'completed', starts_on = '2025-09-01' where id = $1",
    [old],
  );
  draftSeasonId = await newSeason(pglite, L, league.defaultProgramId, { slug: 'winter-2027' });
  hawks = await newTeam(pglite, L, seasonId, { slug: 'hawks', name: 'Hawks' });
  owls = await newTeam(pglite, L, seasonId, { slug: 'owls', name: 'Owls' });
  const binnedTeam = await newTeam(pglite, L, seasonId, { slug: 'gone', name: 'Gone' });
  await pglite.query('update teams set deleted_at = now() where id = $1', [binnedTeam]);
  await pglite.query("update teams set stats_visibility = 'staff' where id = $1", [owls]);
  draftTeam = await newTeam(pglite, L, draftSeasonId, { slug: 'draft-team' });

  const stage = await newStage(pglite, L, seasonId);
  const r1 = await newRound(pglite, L, seasonId, 1);
  const r2 = await newRound(pglite, L, seasonId, 2);
  await pglite.query(
    "update rounds set label = 'Opening week', date = '2026-11-01' where id = $1",
    [r1],
  );
  await pglite.query("update rounds set date = '2026-12-06' where id = $1", [r2]);
  const venue = await one<{ id: string }>(
    pglite,
    "insert into venues (league_id, name, address) values ($1, 'North Gym', '1 Court St') returning id",
    [L],
  );
  await newGame(pglite, {
    leagueId: L,
    seasonId,
    stageId: stage,
    homeTeamId: hawks,
    awayTeamId: owls,
    columns: {
      round_id: r1,
      status: 'final',
      home_score: 40,
      away_score: 31,
      finalized_at: new Date('2026-11-01T20:00:00Z'),
      starts_at: new Date('2026-11-01T18:00:00Z'),
      venue_id: venue.id,
    },
  });
  await newGame(pglite, {
    leagueId: L,
    seasonId,
    stageId: stage,
    homeTeamId: owls,
    awayTeamId: hawks,
    columns: { round_id: r2, starts_at: new Date('2026-12-06T18:00:00Z') },
  });
  await newGame(pglite, {
    leagueId: L,
    seasonId,
    stageId: stage,
    homeTeamId: owls,
    awayTeamId: hawks,
    columns: { starts_at: new Date('2026-12-13T18:00:00Z') },
  });
  const binnedGame = await newGame(pglite, {
    leagueId: L,
    seasonId,
    stageId: stage,
    homeTeamId: owls,
    awayTeamId: hawks,
    columns: { round_id: r2 },
  });
  await pglite.query('update games set deleted_at = now() where id = $1', [binnedGame]);

  const child = await newPerson(pglite, L, {
    firstName: people.child.first,
    lastName: people.child.last,
  });
  await pglite.query(
    'update people set contact_email = $2, birth_date = $3, is_minor = true where id = $1',
    [child, people.child.email, people.child.born],
  );
  const initials = await newPerson(pglite, L, {
    firstName: people.initials.first,
    lastName: people.initials.last,
  });
  await pglite.query("update people set visibility = 'initials', is_minor = false where id = $1", [
    initials,
  ]);
  const removed = await newPerson(pglite, L, {
    firstName: people.removed.first,
    lastName: people.removed.last,
  });
  await pglite.query("update people set visibility = 'removed' where id = $1", [removed]);
  const former = await newPerson(pglite, L, {
    firstName: people.former.first,
    lastName: people.former.last,
  });
  await newRosterEntry(pglite, L, hawks, child, { jersey: '4' });
  await newRosterEntry(pglite, L, hawks, initials, { jersey: '5', role: 'captain' });
  await newRosterEntry(pglite, L, hawks, removed, { jersey: '6' });
  const leftEntry = await newRosterEntry(pglite, L, hawks, former, { jersey: '7' });
  await pglite.query("update roster_entries set left_on = '2026-11-15' where id = $1", [leftEntry]);

  db = createDatabase({ kind: 'pglite', pglite });
  display = { viewer: publicViewer(L), policy: defaultNamePolicy };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const inLeague = <T>(work: (scope: LeagueScope) => Promise<T>) =>
  withTransaction(db, { leagueId: league.leagueId }, work);

describe('seasons', () => {
  it('offers running and finished seasons, newest first, never one being set up', async () => {
    const seasons = await inLeague((scope) => listPublicSeasons(scope));
    expect(seasons.map((s) => [s.slug, s.status, s.isCurrent])).toEqual([
      ['fall-2026', 'active', true],
      ['fall-2025', 'completed', false],
    ]);
  });

  it('finds the current season, or the one `?season=` names, but not a draft', async () => {
    expect((await inLeague((scope) => findPublicSeason(scope)))?.slug).toBe('fall-2026');
    expect(
      (await inLeague((scope) => findPublicSeason(scope, { seasonSlug: 'fall-2025' })))?.slug,
    ).toBe('fall-2025');
    expect(
      await inLeague((scope) => findPublicSeason(scope, { seasonSlug: 'winter-2027' })),
    ).toBeUndefined();
  });

  it('finds nothing in another league', async () => {
    const found = await withTransaction(db, { leagueId: other.leagueId }, (scope) =>
      findPublicSeason(scope),
    );
    expect(found).toBeUndefined();
  });
});

describe('schedule', () => {
  it('lists published games by round with phases, and the unplaced one after', async () => {
    const schedule = await inLeague((scope) => listPublicSchedule(scope, seasonId, '2026-11-20'));
    if (schedule === undefined) throw new Error('no schedule');
    expect(schedule.season.slug).toBe('fall-2026');
    expect(schedule.rounds.map((r) => [r.number, r.label, r.phase, r.games.length])).toEqual([
      [1, 'Opening week', 'past', 1],
      [2, null, 'current', 1],
    ]);
    expect(schedule.unplacedGames).toHaveLength(1);
    const first = schedule.rounds[0]?.games[0];
    expect(first).toMatchObject({
      status: 'final',
      homeScore: 40,
      awayScore: 31,
      localDate: '2026-11-01',
      venue: { name: 'North Gym', address: '1 Court St', mapLink: null },
    });
    expect(first?.homeTeam.name).toBe('Hawks');
    expect(findPrivateFields(schedule, { privateValues: [] })).toEqual([]);
  });

  it('shows no schedule for a season being set up', async () => {
    expect(
      await inLeague((scope) => listPublicSchedule(scope, draftSeasonId, '2026-11-20')),
    ).toBeUndefined();
  });

  it("lists one team's games, and none of a season being set up", async () => {
    const mine = await inLeague((scope) => listPublicGames(scope, seasonId, owls));
    expect(mine).toHaveLength(3);
    expect(await inLeague((scope) => listPublicGames(scope, draftSeasonId))).toEqual([]);
  });
});

describe('teams and rosters', () => {
  it("lists the season's teams (not the one in the bin), restricted ones as totals only", async () => {
    const teams = await inLeague((scope) => listPublicTeams(scope, seasonId, display));
    expect(teams.map((t) => [t.slug, t.statsShown])).toEqual([
      ['hawks', 'player_lines'],
      ['owls', 'team_totals'],
    ]);
    expect(await inLeague((scope) => listPublicTeams(scope, draftSeasonId, display))).toEqual([]);
  });

  it('finds a team by its short name', async () => {
    expect((await inLeague((scope) => findPublicTeam(scope, seasonId, 'hawks', display)))?.id).toBe(
      hawks,
    );
    expect(
      await inLeague((scope) => findPublicTeam(scope, seasonId, 'gone', display)),
    ).toBeUndefined();
    expect(
      await inLeague((scope) => findPublicTeam(scope, draftSeasonId, 'draft-team', display)),
    ).toBeUndefined();
  });

  it('shows a youth league first names and initials, marks the former player, and leaks nothing', async () => {
    const roster = await inLeague((scope) => listPublicRoster(scope, hawks, display));
    const names = roster.lines.map((line) => [line.jerseyNumber, line.name, line.former]);
    expect(names).toEqual([
      ['4', { shown: true, text: 'Zuri M.' }, false],
      ['5', { shown: true, text: 'Layla Hassan' }, false],
      ['6', { shown: false, why: 'removed' }, false],
      ['7', { shown: true, text: 'Nadia P.' }, true],
    ]);
    const shown = (line: number): ShownName =>
      roster.lines[line]?.name ?? { shown: false, why: 'no_name' };
    const privateValues = [
      ...privateValuesOf(
        {
          firstName: people.child.first,
          lastName: people.child.last,
          nameRequest: 'none',
          birthDate: people.child.born,
          contactEmail: people.child.email,
        },
        shown(0),
      ),
      ...privateValuesOf(
        { firstName: people.removed.first, lastName: people.removed.last, nameRequest: 'removed' },
        shown(2),
      ),
      ...privateValuesOf(
        { firstName: people.former.first, lastName: people.former.last, nameRequest: 'none' },
        shown(3),
      ),
    ];
    expect(findPrivateFields(roster, { privateValues })).toEqual([]);
  });

  it('shows nothing for a team of a season being set up', async () => {
    const roster = await inLeague((scope) => listPublicRoster(scope, draftTeam, display));
    expect(roster.lines).toEqual([]);
  });
});
