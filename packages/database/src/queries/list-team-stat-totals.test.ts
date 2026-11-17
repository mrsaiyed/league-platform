// Against the real database: a team's season totals are its players' lines added up, but
// its points are its final scores over the games its players' points were recorded in
// (S-26 as changed by step 2.196). The two-league case is in ../isolation
// (public-reads-cases.test-helper.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../db/with-transaction.ts';
import { openTwoLeagues, type TwoLeagues } from '../isolation/two-leagues.test-helper.ts';
import { listTeamStatTotals } from './list-team-stat-totals.ts';

let leagues: TwoLeagues;

beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

const totals = () =>
  withTransaction(leagues.db, { leagueId: leagues.a.leagueId }, (scope) =>
    listTeamStatTotals(scope, leagues.a.seasonId),
  );

describe('listTeamStatTotals', () => {
  it("gives a team its final score as its points, and its players' other numbers added up", async () => {
    const { a } = leagues;
    // The seeded final game: 52 to 48, and one home player's line of 2 points, one 2.
    expect(await totals()).toEqual([
      { teamId: a.teamId, statKey: 'fg2', total: 1, gamesRecorded: 1 },
      { teamId: a.teamId, statKey: 'points', total: 52, gamesRecorded: 1 },
    ]);
  });

  it("counts each game's score once, however many players scored, and only games with points", async () => {
    const { a, pglite } = leagues;
    await pglite.query(
      `insert into people (id, league_id, first_name, last_name, is_minor)
       values ('01900000-0000-7000-8000-0000000f2196', $1, 'Pat', 'Second', false)`,
      [a.leagueId],
    );
    await pglite.query(
      `insert into player_game_stats (league_id, game_id, team_id, person_id, jersey_number, played, stats)
       values ($1, $2, $3, '01900000-0000-7000-8000-0000000f2196', '8', true, '{"points": 7, "fouls": 1}')`,
      [a.leagueId, a.gameId, a.teamId],
    );
    expect(await totals()).toEqual([
      { teamId: a.teamId, statKey: 'fg2', total: 1, gamesRecorded: 1 },
      { teamId: a.teamId, statKey: 'fouls', total: 1, gamesRecorded: 1 },
      { teamId: a.teamId, statKey: 'points', total: 52, gamesRecorded: 1 },
    ]);
  });
});
