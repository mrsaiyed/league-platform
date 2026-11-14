import { describe, expect, it } from 'vitest';
import {
  game,
  memoryStandings,
  ownerId,
  rules,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';
import { previewRulesChange } from './preview-rules-change.ts';

const decided = (n: number, home: number, away: number, homeScore: number, awayScore: number) =>
  game(n, home, away, {
    status: 'final',
    homeScore,
    awayScore,
    finalizedAt: '2026-12-20T20:00:00.000Z',
  });

// Three teams one win each, in a circle, so head-to-head cannot separate them. By point
// difference the order is 2, 1, 3; by points scored it is 2, 3, 1.
const circle = [decided(1, 1, 2, 60, 50), decided(2, 2, 3, 100, 60), decided(3, 3, 1, 61, 60)];

async function preview(
  games: ReturnType<typeof decided>[],
  change: Parameters<typeof rules>[0],
  state: Parameters<typeof memoryStandings>[0] = {},
) {
  const { transaction, as } = memoryStandings({ games, ...state });
  return transaction(as(ownerId), (tx) => previewRulesChange(tx, seasonId, rules(change)));
}

describe('previewRulesChange', () => {
  it('lists exactly the teams a tiebreaker change moves', async () => {
    const result = await preview(circle, (r) => {
      r.tiebreakers = ['head-to-head', 'points-scored'];
    });
    expect(result?.gamesDecided).toBe(true);
    expect(result?.moves.map((m) => m.teamId)).toEqual([teamId(1), teamId(3)]);
    expect(result?.moves[0]?.changes).toEqual([
      { field: 'rank', from: 2, to: 3 },
      { field: 'seed', from: 2, to: 3 },
    ]);
    expect(result?.moves[1]?.changes).toEqual([
      { field: 'rank', from: 3, to: 2 },
      { field: 'seed', from: 3, to: 2 },
    ]);
  });

  it('lists nobody for a change the standings do not show, game rules included', async () => {
    const result = await preview(circle, (r) => {
      r.fouls.bonusFouls = 5;
    });
    expect(result).toEqual({ gamesDecided: true, moves: [] });
  });

  it('shows a forfeit score that changes point difference', async () => {
    const forfeit = game(1, 1, 2, {
      status: 'forfeit',
      homeScore: 20,
      awayScore: 0,
      finalizedAt: '2026-12-20T20:00:00.000Z',
    });
    const result = await preview([forfeit], (r) => {
      r.forfeit.countsInPointDifference = true;
    });
    // The forfeit's two teams get points for and against; the two teams with no game
    // move up past the loser, whose difference is now below theirs.
    expect(result?.moves.map((m) => m.teamId)).toEqual([
      teamId(1),
      teamId(2),
      teamId(3),
      teamId(4),
    ]);
    expect(result?.moves[0]?.changes).toEqual([
      { field: 'pointsFor', from: 0, to: 20 },
      { field: 'pointDifference', from: 0, to: 20 },
    ]);
    expect(result?.moves[2]?.changes.map((c) => c.field)).toEqual(['seed']);
  });

  it('says no game is decided before the first one, and nothing for a season that is not here', async () => {
    expect((await preview([], (r) => void (r.tiebreakers = ['points-scored'])))?.gamesDecided).toBe(
      false,
    );
    const { transaction, as } = memoryStandings();
    expect(
      await transaction(as(ownerId), (tx) => previewRulesChange(tx, teamId(77), rules())),
    ).toBeUndefined();
  });
});
