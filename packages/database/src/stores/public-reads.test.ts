// Step 2.40 against the real database: loaded as a visitor, a staff-only team's player
// numbers never appear (S-22, T-87), in the standings, team records, leaders, the full
// table or a game's page; the team's staff and an admin do get them. The league's other
// team, which shows everyone, is always there. The two-league cases are in ../isolation.
import {
  defaultNamePolicy,
  publicViewer,
  readGamePage,
  readStandings,
  readStatisticsTable,
  readStatLeaders,
  readTeamRecords,
  type Viewer,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../db/with-transaction.ts';
import { openTwoLeagues, type TwoLeagues } from '../isolation/two-leagues.test-helper.ts';
import { gamesReadStore } from './games-read-store.ts';
import { standingsReadStore } from './standings-read-store.ts';

let leagues: TwoLeagues;
const hiddenPoints = 4321;
const openPlayerId = randomUUID();
const openPoints = 8765;
const otherHiddenPoints = 1000;
const otherHiddenPlayerId = randomUUID();

beforeAll(async () => {
  leagues = await openTwoLeagues();
  const { pglite, a } = leagues;
  // The staff-only team's player (the seed's) gets numbers and plays worth searching for.
  await pglite.query(
    `update player_game_stats set stats = $1 where game_id = $2 and person_id = $3`,
    [JSON.stringify({ points: hiddenPoints }), a.gameId, a.personId],
  );
  await pglite.query(
    `update season_player_totals set stats = $1 where season_id = $2 and person_id = $3`,
    [
      JSON.stringify({
        version: 1,
        stats: { points: { total: hiddenPoints, gamesRecorded: 1 } },
      }),
      a.seasonId,
      a.personId,
    ],
  );
  // A second player of the same team, so the team's total is no one player's number.
  await pglite.query(
    `insert into people (id, league_id, first_name, last_name, is_minor) values ($1, $2, 'Sam', 'Second', false)`,
    [otherHiddenPlayerId, a.leagueId],
  );
  await pglite.query(
    `insert into player_game_stats (league_id, game_id, team_id, person_id, jersey_number, played, stats)
     values ($1, $2, $3, $4, '41', true, $5)`,
    [
      a.leagueId,
      a.gameId,
      a.teamId,
      otherHiddenPlayerId,
      JSON.stringify({ points: otherHiddenPoints }),
    ],
  );
  // A player of the team that shows everyone, with a line and totals.
  await pglite.query(
    `insert into people (id, league_id, first_name, last_name, is_minor) values ($1, $2, 'Olive', 'Open', false)`,
    [openPlayerId, a.leagueId],
  );
  await pglite.query(
    `insert into player_game_stats (league_id, game_id, team_id, person_id, jersey_number, played, stats)
     values ($1, $2, $3, $4, '9', true, $5)`,
    [a.leagueId, a.gameId, a.opponentId, openPlayerId, JSON.stringify({ points: openPoints })],
  );
  await pglite.query(
    `insert into season_player_totals (league_id, season_id, person_id, games_played, stats)
     values ($1, $2, $3, 1, $4)`,
    [
      a.leagueId,
      a.seasonId,
      openPlayerId,
      JSON.stringify({ version: 1, stats: { points: { total: openPoints, gamesRecorded: 1 } } }),
    ],
  );
  await pglite.query(`update game_states set state = $1 where game_id = $2`, [
    JSON.stringify({
      version: 1,
      status: 'final',
      rules: { periods: 4 },
      plays: [
        { type: 'score', side: 'home', playerId: a.personId, points: 2, period: 1, clockMs: 1 },
        { type: 'score', side: 'away', playerId: openPlayerId, points: 3, period: 1, clockMs: 1 },
      ],
    }),
    a.gameId,
  ]);
});
afterAll(async () => {
  await leagues.close();
});

const viewing = (viewer: Viewer) => ({
  leagueId: leagues.a.leagueId,
  viewer,
  audience: 'adult' as const,
  policy: defaultNamePolicy,
});

/** Every public read of league A, as one text, for this viewer. */
async function everythingFor(viewer: Viewer): Promise<string> {
  const { a } = leagues;
  return JSON.stringify(
    await withTransaction(leagues.db, { leagueId: a.leagueId }, async (scope) => {
      const standings = standingsReadStore(scope);
      return {
        standings: await readStandings(standings, { seasonId: a.seasonId }),
        records: await readTeamRecords(standings, { seasonId: a.seasonId }),
        table: await readStatisticsTable(standings, {
          seasonId: a.seasonId,
          viewing: viewing(viewer),
        }),
        leaders: await readStatLeaders(
          standings,
          { seasonId: a.seasonId, measure: 'points' },
          viewing(viewer),
        ),
        game: await readGamePage(gamesReadStore(scope), { gameId: a.gameId }, viewing(viewer)),
      };
    }),
  );
}

describe('the public reads against the database (S-22, T-87)', () => {
  it("never show a visitor the staff-only team's player numbers, names or ids", async () => {
    const text = await everythingFor(publicViewer(leagues.a.leagueId));
    expect(text).not.toContain(String(hiddenPoints));
    expect(text).not.toContain(leagues.a.personId);
    expect(text).not.toContain(otherHiddenPlayerId);
    expect(text).not.toContain('Sam');
    expect(text).not.toContain('alpha P.');
    expect(text).not.toContain('"41"');
    // What everyone may see is there: the other team's numbers, both teams' totals.
    expect(text).toContain(String(openPoints));
    expect(text).toContain(openPlayerId);
    expect(text).toContain('Olive Open');
    expect(text).toContain('Team alpha');
    expect(text).toContain('"points":{"total":' + (hiddenPoints + otherHiddenPoints));
  });

  it("show the team's coach and an admin the numbers, and another team's coach does not", async () => {
    const { a } = leagues;
    const coach: Viewer = { leagueId: a.leagueId, leagueAdmin: false, staffOfTeamIds: [a.teamId] };
    const admin: Viewer = { leagueId: a.leagueId, leagueAdmin: true, staffOfTeamIds: [] };
    const other: Viewer = {
      leagueId: a.leagueId,
      leagueAdmin: false,
      staffOfTeamIds: [a.opponentId],
    };
    for (const viewer of [coach, admin]) {
      const text = await everythingFor(viewer);
      expect(text).toContain(a.personId);
      expect(text).toContain('alpha P.');
    }
    expect(await everythingFor(other)).not.toContain(a.personId);
  });

  it('show the game as corrected, by date only, and give standings with the adjustment note', async () => {
    const text = await everythingFor(publicViewer(leagues.a.leagueId));
    expect(text).toMatch(/"correctedOn":"\d{4}-\d{2}-\d{2}"/);
    expect(text).not.toContain('was missed');
    expect(text).toContain('Late roster for alpha');
  });
});
