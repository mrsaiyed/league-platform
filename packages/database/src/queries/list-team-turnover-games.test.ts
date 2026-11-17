// Step 2.196 against the real database: the turnovers charged to a team in each of the
// season's final games, counted from the saved plays, are the engine's own count (the one
// a game's page shows, teamOwnCounts) in every case here: undone, taken back, done again,
// on both sides. The two-league case is in ../isolation (public-reads-cases.test-helper.ts).
import { teamOwnCounts } from '@srleagues/core';
import { basketball } from '@srleagues/sports';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../db/with-transaction.ts';
import { openTwoLeagues, type TwoLeagues } from '../isolation/two-leagues.test-helper.ts';
import { listTeamTurnoverGames } from './list-team-turnover-games.ts';

let leagues: TwoLeagues;

/** The engine's state after these taps, a second apart. */
const played = (taps: readonly basketball.Command[]) =>
  taps.reduce(
    (state, command, i) => basketball.apply(state, command, { id: `c${i}`, now: 1_000 * (i + 1) }),
    basketball.newGame(),
  );

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
  it("counts the seeded game's turnover charged to the away team, whose players have no line", async () => {
    const { a } = leagues;
    expect(await listed()).toEqual([
      { gameId: a.gameId, teamId: a.opponentId, turnovers: 1, countedByLines: false },
    ]);
  });

  it("gives the engine's own count, per side, however the plays went", async () => {
    const { a, pglite } = leagues;
    const start: basketball.Command[] = [{ type: 'start' }];
    const home: basketball.Command = { type: 'team-turnover', side: 'home' };
    const away: basketball.Command = { type: 'team-turnover', side: 'away' };
    const cases: (readonly basketball.Command[])[] = [
      [...start, home],
      [...start, home, { type: 'undo' }],
      [...start, home, { type: 'undo' }, { type: 'redo' }],
      [...start, home, home, { type: 'team-unturnover', side: 'home' }],
      [...start, home, { type: 'team-unturnover', side: 'home' }, home, home, away],
      [...start, away, home, away, { type: 'team-unturnover', side: 'away' }, { type: 'undo' }],
    ];
    for (const taps of cases) {
      const state = played(taps);
      await setState(a.gameId, state);
      const engine = teamOwnCounts(state);
      const counted = new Map((await listed()).map((row) => [row.teamId, row.turnovers]));
      expect(counted.get(a.teamId) ?? 0, JSON.stringify(taps)).toBe(engine.home.turnovers);
      expect(counted.get(a.opponentId) ?? 0, JSON.stringify(taps)).toBe(engine.away.turnovers);
    }
    // A played line of the team that carries turnovers counts the game already.
    await pglite.query(
      `update player_game_stats set stats = stats || '{"turnovers": 0}' where game_id = $1`,
      [a.gameId],
    );
    await setState(a.gameId, played([...start, home]));
    expect(await listed()).toEqual([
      { gameId: a.gameId, teamId: a.teamId, turnovers: 1, countedByLines: true },
    ]);
  });

  it('leaves out a game that is not final, or is in the bin, and another season', async () => {
    const { a, b, pglite } = leagues;
    const withOne = JSON.stringify(
      played([{ type: 'start' }, { type: 'team-turnover', side: 'home' }]),
    );
    await setState(a.gameId, played([{ type: 'start' }, { type: 'team-turnover', side: 'away' }]));
    await pglite.query(
      'insert into game_states (league_id, game_id, seq, state) values ($1, $2, 1, $3)',
      [a.leagueId, a.upcomingGameId, withOne],
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
      [a.leagueId, binned.rows[0]?.id, withOne],
    );
    expect((await listed()).map((row) => row.gameId)).toEqual([a.gameId]);
    // The other league's game has one too, in its own season: never counted here.
    expect((await listed()).map((row) => row.gameId)).not.toContain(b.gameId);
  });
});
