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
const mixedPlayerId = randomUUID();
const mixedHiddenPoints = 4040;
const mixedOpenPoints = 7;

beforeAll(async () => {
  leagues = await openTwoLeagues();
  const { pglite, a } = leagues;
  // The seeded season is still being set up; a published one is what a visitor can read.
  await pglite.query(`update seasons set status = 'active' where id = $1`, [a.seasonId]);
  await pglite.query(`update leagues set time_zone = 'America/Chicago' where id = $1`, [
    a.leagueId,
  ]);
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
  // A player of the staff-only team who also scored in a game of the open team: their
  // stored totals hold both (record 033), so only the open team's game may show.
  await pglite.query(
    `insert into people (id, league_id, first_name, last_name, is_minor) values ($1, $2, 'Mina', 'Mixed', false)`,
    [mixedPlayerId, a.leagueId],
  );
  const secondGame = await pglite.query<{ id: string }>(
    `insert into games (league_id, season_id, stage_id, home_team_id, away_team_id, status, capture_mode,
       home_score, away_score, format, finalized_at)
     values ($1, $2, (select id from stages where season_id = $2), $3, $4, 'final', 'box', 50, 45, '{"version": 1, "periods": 2}',
       '2026-12-13T19:30:00Z') returning id`,
    [a.leagueId, a.seasonId, a.opponentId, a.teamId],
  );
  const secondGameId = secondGame.rows[0]?.id;
  await pglite.query(
    `insert into player_game_stats (league_id, game_id, team_id, person_id, jersey_number, played, stats)
     values ($1, $2, $3, $4, '5', true, $5), ($1, $6, $7, $4, '5', true, $8)`,
    [
      a.leagueId,
      a.gameId,
      a.teamId,
      mixedPlayerId,
      JSON.stringify({ points: mixedHiddenPoints }),
      secondGameId,
      a.opponentId,
      JSON.stringify({ points: mixedOpenPoints }),
    ],
  );
  await pglite.query(
    `insert into season_player_totals (league_id, season_id, person_id, games_played, stats)
     values ($1, $2, $3, 2, $4)`,
    [
      a.leagueId,
      a.seasonId,
      mixedPlayerId,
      JSON.stringify({
        version: 1,
        stats: {
          points: { total: mixedHiddenPoints + mixedOpenPoints, gamesRecorded: 2 },
        },
      }),
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
    expect(text).toContain(
      '"points":{"total":' + (hiddenPoints + otherHiddenPoints + mixedHiddenPoints),
    );
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

  it("counts a player of a public team who also sits on the staff-only team only for the public team's game", async () => {
    const { a } = leagues;
    const text = await everythingFor(publicViewer(a.leagueId));
    expect(text).not.toContain(String(mixedHiddenPoints));
    expect(text).not.toContain(String(mixedHiddenPoints + mixedOpenPoints));
    const table = await withTransaction(leagues.db, { leagueId: a.leagueId }, (scope) =>
      readStatisticsTable(standingsReadStore(scope), {
        seasonId: a.seasonId,
        viewing: viewing(publicViewer(a.leagueId)),
      }),
    );
    const mixed = table.ok
      ? table.value.players.find((p) => p.personId === mixedPlayerId)
      : undefined;
    expect(mixed?.stats['points']?.total).toBe(mixedOpenPoints);
    expect(mixed?.teamIds).toEqual([a.opponentId]);
  });

  it("gives the correction's date in the league's time zone", async () => {
    const { a, pglite } = leagues;
    // 03:30 UTC on the 7th is the evening of the 6th in Chicago.
    await pglite.query(
      `insert into game_corrections (league_id, game_id, account_id, reason, before, after, created_at)
       values ($1, $2, (select owner_account_id from leagues where id = $1), 'later fix',
         '{"version": 1, "homeScore": 52}', '{"version": 1, "homeScore": 52}', '2030-12-07T03:30:00Z')`,
      [a.leagueId, a.gameId],
    );
    const page = await withTransaction(leagues.db, { leagueId: a.leagueId }, (scope) =>
      readGamePage(gamesReadStore(scope), { gameId: a.gameId }, viewing(publicViewer(a.leagueId))),
    );
    expect(page.ok && page.value.game.correctedOn).toBe('2030-12-06');
  });

  it('finds nothing at all of a season that is still being set up', async () => {
    const { a, pglite } = leagues;
    try {
      for (const status of ['draft']) {
        await pglite.query(`update seasons set status = $1 where id = $2`, [status, a.seasonId]);
        const results = await withTransaction(
          leagues.db,
          { leagueId: a.leagueId },
          async (scope) => {
            const standings = standingsReadStore(scope);
            const input = { seasonId: a.seasonId };
            const v = viewing(publicViewer(a.leagueId));
            return [
              await readStandings(standings, input),
              await readTeamRecords(standings, input),
              await readStatisticsTable(standings, { ...input, viewing: v }),
              await readStatLeaders(standings, { ...input, measure: 'points' }, v),
              await readGamePage(gamesReadStore(scope), { gameId: a.gameId }, v),
            ];
          },
        );
        for (const result of results) expect(result.ok).toBe(false);
      }
    } finally {
      await pglite.query(`update seasons set status = 'active' where id = $1`, [a.seasonId]);
    }
  });
});
