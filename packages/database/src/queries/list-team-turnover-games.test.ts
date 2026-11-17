// Step 2.196 against the real database: the season's final games whose saved plays hold
// a turnover charged to a team, with their teams and state, and no other game. The
// two-league case is in ../isolation (public-reads-cases.test-helper.ts).
import { teamOwnCounts } from '@srleagues/core';
import { basketball } from '@srleagues/sports';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../db/with-transaction.ts';
import { openTwoLeagues, type TwoLeagues } from '../isolation/two-leagues.test-helper.ts';
import { listTeamTurnoverGames } from './list-team-turnover-games.ts';

let leagues: TwoLeagues;

/** The engine's state after these taps: a turnover charged to the home team, and one undone. */
const withTeamTurnover = (undone: boolean) => {
  const taps: basketball.Command[] = [
    { type: 'start' },
    { type: 'team-turnover', side: 'home' },
    ...(undone ? [{ type: 'undo' } as const] : []),
  ];
  return taps.reduce(
    (state, command, i) => basketball.apply(state, command, { id: `c${i}`, now: 1_000 * (i + 1) }),
    basketball.newGame(),
  );
};

beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

const listed = () =>
  withTransaction(leagues.db, { leagueId: leagues.a.leagueId }, (scope) =>
    listTeamTurnoverGames(scope, leagues.a.seasonId),
  );
const setState = async (gameId: string, state: unknown) =>
  leagues.pglite.query('update game_states set state = $1 where game_id = $2', [
    JSON.stringify(state),
    gameId,
  ]);

describe('listTeamTurnoverGames', () => {
  it('lists nothing while no final game has a turnover charged to a team', async () => {
    expect(await listed()).toEqual([]);
  });

  it('lists a final game with one, with its two teams and the state the engine reads', async () => {
    const { a, pglite } = leagues;
    await setState(a.gameId, withTeamTurnover(false));
    const games = await listed();
    expect(games.map((g) => [g.gameId, g.homeTeamId, g.awayTeamId])).toEqual([
      [a.gameId, a.teamId, a.opponentId],
    ]);
    expect(teamOwnCounts(games[0]?.state).home.turnovers).toBe(1);
    // An undone team turnover is still a play on the redo stack, never in the plays: not listed.
    await setState(a.gameId, withTeamTurnover(true));
    expect(await listed()).toEqual([]);
    // A game that is not final, or is in the bin, is not counted in a season's totals.
    await setState(a.gameId, withTeamTurnover(false));
    await pglite.query(
      'insert into game_states (league_id, game_id, seq, state) values ($1, $2, 1, $3)',
      [a.leagueId, a.upcomingGameId, JSON.stringify(withTeamTurnover(false))],
    );
    const binned = await pglite.query<{ id: string }>(
      `insert into games (league_id, season_id, stage_id, home_team_id, away_team_id, status,
         capture_mode, home_score, away_score, format, finalized_at, deleted_at)
       values ($1, $2, (select id from stages where season_id = $2), $3, $4, 'final', 'live',
         10, 8, '{"version": 1, "periods": 2}', now(), now()) returning id`,
      [a.leagueId, a.seasonId, a.teamId, a.opponentId],
    );
    await pglite.query(
      'insert into game_states (league_id, game_id, seq, state) values ($1, $2, 1, $3)',
      [a.leagueId, binned.rows[0]?.id, JSON.stringify(withTeamTurnover(false))],
    );
    expect((await listed()).map((g) => g.gameId)).toEqual([a.gameId]);
  });

  it("never lists the other league's game, though it has one too", async () => {
    const { b } = leagues;
    await setState(b.gameId, withTeamTurnover(false));
    expect((await listed()).map((g) => g.gameId)).not.toContain(b.gameId);
  });
});
