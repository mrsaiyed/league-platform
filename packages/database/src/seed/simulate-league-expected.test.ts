// Step 2.236, fix round: the plan's own working-out of the tables, on the smallest cases
// worked by hand. Three teams each 1-1 in a circle are level on win percentage and on
// head-to-head. With margins 10, 18 and 2 (A beat B 60-50, B beat C 98-80, C beat A 52-50)
// point difference splits them A +8, B +8, C -16; A and B start again among themselves, and
// head-to-head (A beat B) puts A first, although B scored more (148 to 110). With every
// margin 10 nothing separates them: one shared place.
import { seasonRulesPreset } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { expectedGame, expectedTables } from './simulate-league-expected.ts';
import type { PlannedGame, SimulationPlan } from './simulate-league-plan.ts';

const rules = seasonRulesPreset('high-school');

function planOf(scores: readonly (readonly [string, number, string, number])[]): SimulationPlan {
  const games = scores.map(
    ([home, homeScore, away, awayScore], k): PlannedGame => ({
      number: k + 1,
      round: k + 1,
      date: `2025-01-0${k + 1}`,
      time: '18:00',
      division: 0,
      home,
      away,
      homeScore,
      awayScore,
      plays: null,
      overtime: false,
      callOff: null,
    }),
  );
  const team = (name: string) => ({ name }) as SimulationPlan['divisions'][number]['teams'][number];
  return {
    divisions: [{ name: 'D', teams: ['A', 'B', 'C'].map(team) }],
    games,
  } as unknown as SimulationPlan;
}

describe('the plan’s working-out of the tables', () => {
  it('starts again among the teams a tiebreaker leaves level', () => {
    const [table] = expectedTables(
      planOf([
        ['A', 60, 'B', 50],
        ['B', 98, 'C', 80],
        ['C', 52, 'A', 50],
      ]),
      rules,
    );
    expect(rules.tiebreakers).toEqual(['head-to-head', 'point-difference', 'points-scored']);
    expect(table?.places).toEqual([['A'], ['B'], ['C']]);
    expect([table?.ordered, table?.unseparated]).toEqual([1, 0]);
    expect(table?.rows.get('B')).toMatchObject({ wins: 1, losses: 1, pointsFor: 148 });
  });

  it('leaves teams nothing separates in one place', () => {
    const [table] = expectedTables(
      planOf([
        ['A', 60, 'B', 50],
        ['B', 60, 'C', 50],
        ['C', 60, 'A', 50],
      ]),
      rules,
    );
    expect(table?.places.map((p) => [...p].sort())).toEqual([['A', 'B', 'C']]);
    expect([table?.ordered, table?.unseparated]).toEqual([0, 1]);
  });

  it('scores a forfeit at the season’s forfeit score for the side that forfeits', () => {
    const [game] = planOf([['A', 60, 'B', 50]]).games;
    const forfeited = { ...game!, callOff: { kind: 'forfeit', forfeiting: 'home' } } as const;
    expect(expectedGame(forfeited, rules)).toEqual({
      number: 1,
      status: 'forfeit',
      home: rules.forfeit.loserScore,
      away: rules.forfeit.winnerScore,
    });
  });
});
