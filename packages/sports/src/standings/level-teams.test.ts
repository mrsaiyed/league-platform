// How level teams were ordered (step 2.198; P7 §1, S-9, S-74): beside the order, which is
// unchanged, every row of a set of level teams says which teams they are and each
// tiebreaker tried on them, with each team's place, figure and head-to-head record. The
// numbers audit's cases 31 to 33 and 46, and the reader's four-team example.
import { describe, expect, it } from 'vitest';
import { calculateStandings } from './calculate-standings.ts';
import { generatedSeason, seeded } from './generated-season.test-helper.ts';
import type { LevelTeams, StandingsGame, StandingsRow, StandingsRules } from './types.ts';

// The basketball defaults of P7 §1.
const rules: StandingsRules = {
  standings: { rankBy: 'win-percentage', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
  tiebreakers: ['head-to-head', 'point-difference', 'points-scored'],
  allowTies: false,
  forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
};

let day = 0;
function final(
  homeTeamId: string,
  homeScore: number,
  awayTeamId: string,
  awayScore: number,
): StandingsGame {
  day++;
  return {
    gameId: `g${day}`,
    status: 'final',
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    winnerTeamId: null,
    startsAt: new Date(Date.UTC(2026, 0, day, 18)).toISOString(),
  };
}

function rowsOf(
  ids: readonly string[],
  games: readonly StandingsGame[],
  given: StandingsRules = rules,
): readonly StandingsRow[] {
  const result = calculateStandings({
    teams: ids.map((teamId) => ({ teamId, divisionId: null })),
    games,
    rules: given,
  });
  const [table] = result.tables;
  if (!table) throw new Error('no table');
  return table.rows;
}

const order = (rows: readonly StandingsRow[]) => rows.map((row) => row.teamId);

/** The level teams of a row, checked to be the same on each of them. */
function levelOf(rows: readonly StandingsRow[], teamId: string): LevelTeams {
  const row = rows.find((r) => r.teamId === teamId);
  if (!row?.level) throw new Error(`${teamId} is level with nobody`);
  for (const other of row.level.teamIds) {
    expect(rows.find((r) => r.teamId === other)?.level).toEqual(row.level);
  }
  return row.level;
}

/** Each step written short: tiebreaker, applied or not, and each team as id:place[:figure][:record]. */
function short(level: LevelTeams): string[] {
  return level.steps.map((step) =>
    [
      step.tiebreaker,
      step.applied ? 'applied' : 'passed-over',
      ...step.teams.map((t) =>
        [
          t.teamId,
          t.place,
          ...(t.value === null ? [] : [t.value]),
          ...(t.record === null ? [] : [`${t.record.wins}-${t.record.losses}-${t.record.ties}`]),
        ].join(':'),
      ),
    ].join(' '),
  );
}

describe('level teams: how the tiebreakers ordered them', () => {
  it('case 46: four level teams who met in separate pairs (North Valley, West)', () => {
    // As seeded: Otters beat Lions 58-49; Lions beat Bears 50-44; Tigers and Hawks split,
    // 55-48 and 47-51; Bears beat Badgers 60-52. Lions, Tigers, Hawks and Bears are 1-1.
    const games = [
      final('tigers', 55, 'hawks', 48),
      final('bears', 60, 'badgers', 52),
      final('hawks', 51, 'tigers', 47),
      final('otters', 58, 'lions', 49),
      final('lions', 50, 'bears', 44),
    ];
    const rows = rowsOf(['otters', 'badgers', 'lions', 'tigers', 'hawks', 'bears'], games);
    expect(order(rows)).toEqual(['otters', 'lions', 'tigers', 'hawks', 'bears', 'badgers']);
    expect(rows.map((r) => r.decidedBy)).toEqual([
      null,
      'head-to-head',
      'point-difference',
      'point-difference',
      'head-to-head',
      null,
    ]);
    expect(rows[0]?.level).toBeNull();
    expect(rows[5]?.level).toBeNull();
    const level = levelOf(rows, 'lions');
    expect(level.teamIds).toEqual(['lions', 'tigers', 'hawks', 'bears']);
    // Head-to-head counts every game among the four (S-74): Lions 1-0, Tigers and Hawks
    // 1-1, Bears 0-1. Tigers and Hawks start again: 1-1 between them, then point
    // difference, +3 against -3.
    expect(short(level)).toEqual([
      'head-to-head applied lions:1:1-0-0 hawks:2:1-1-0 tigers:2:1-1-0 bears:4:0-1-0',
      'head-to-head applied hawks:1:1-1-0 tigers:1:1-1-0',
      'point-difference applied tigers:1:3 hawks:2:-3',
    ]);
  });

  it('the reader’s four: head-to-head puts A and D above B and C, then other tiebreakers', () => {
    // A beat B, D beat C; all four 1-1. A and D never met, nor did B and C.
    const games = [
      final('a', 60, 'b', 55),
      final('e', 51, 'a', 50),
      final('d', 45, 'c', 40),
      final('e', 41, 'd', 40),
      final('b', 80, 'f', 60),
      final('c', 50, 'f', 45),
    ];
    const rows = rowsOf(['a', 'b', 'c', 'd', 'e', 'f'], games);
    expect(order(rows)).toEqual(['e', 'a', 'd', 'b', 'c', 'f']);
    expect(rows.map((r) => r.decidedBy)).toEqual([
      null,
      'points-scored',
      'points-scored',
      'point-difference',
      'point-difference',
      null,
    ]);
    // B has the best point difference of the four (+15) and is third: head-to-head
    // decided that, and the row says so.
    expect(short(levelOf(rows, 'b'))).toEqual([
      'head-to-head applied a:1:1-0-0 d:1:1-0-0 b:3:0-1-0 c:3:0-1-0',
      'head-to-head passed-over a:1:0-0-0 d:1:0-0-0',
      'point-difference applied a:1:4 d:1:4',
      'points-scored applied a:1:110 d:2:85',
      'head-to-head passed-over b:1:0-0-0 c:1:0-0-0',
      'point-difference applied b:1:15 c:2:0',
    ]);
  });

  it('case 31: three level, head-to-head in a circle, point difference orders all three', () => {
    // Ash beat Birch by 5, Birch beat Cedar by 10, Cedar beat Ash by 2.
    const games = [
      final('ash', 50, 'birch', 45),
      final('birch', 60, 'cedar', 50),
      final('cedar', 42, 'ash', 40),
    ];
    const rows = rowsOf(['ash', 'birch', 'cedar'], games);
    expect(order(rows)).toEqual(['birch', 'ash', 'cedar']);
    expect(short(levelOf(rows, 'cedar'))).toEqual([
      'head-to-head applied ash:1:1-1-0 birch:1:1-1-0 cedar:1:1-1-0',
      'point-difference applied birch:1:5 ash:2:3 cedar:3:-8',
    ]);
  });

  it('case 32: three level, head-to-head orders all three in one step', () => {
    // Five teams, each pair once, the first named wins: Elm 3-1; Ash, Birch, Cedar 2-2,
    // with Ash 2-0, Birch 1-1 and Cedar 0-2 among them; Dogwood 1-3.
    const games = [
      final('ash', 50, 'birch', 40),
      final('ash', 50, 'cedar', 40),
      final('birch', 50, 'cedar', 40),
      final('elm', 50, 'ash', 40),
      final('dogwood', 50, 'ash', 40),
      final('elm', 50, 'birch', 40),
      final('birch', 50, 'dogwood', 40),
      final('cedar', 50, 'elm', 40),
      final('cedar', 50, 'dogwood', 40),
      final('elm', 50, 'dogwood', 40),
    ];
    const rows = rowsOf(['ash', 'birch', 'cedar', 'dogwood', 'elm'], games);
    expect(rows.map((r) => `${r.teamId} ${r.wins}-${r.losses} ${r.decidedBy}`)).toEqual([
      'elm 3-1 null',
      'ash 2-2 head-to-head',
      'birch 2-2 head-to-head',
      'cedar 2-2 head-to-head',
      'dogwood 1-3 null',
    ]);
    expect(short(levelOf(rows, 'birch'))).toEqual([
      'head-to-head applied ash:1:2-0-0 birch:2:1-1-0 cedar:3:0-2-0',
    ]);
  });

  it('case 33: three level where two never met: head-to-head applies and leaves them level', () => {
    // Ash and Birch never met; each split two games with Cedar. Cedar 2-2, the others 1-1.
    const games = [
      final('ash', 50, 'cedar', 45),
      final('cedar', 50, 'ash', 45),
      final('birch', 41, 'cedar', 40),
      final('cedar', 50, 'birch', 40),
    ];
    const rows = rowsOf(['ash', 'birch', 'cedar'], games);
    expect(order(rows)).toEqual(['cedar', 'ash', 'birch']);
    expect(short(levelOf(rows, 'ash'))).toEqual([
      'head-to-head applied ash:1:1-1-0 birch:1:1-1-0 cedar:1:2-2-0',
      'point-difference applied cedar:1:9 ash:2:0 birch:3:-9',
    ]);
  });

  it('says head-to-head was passed over, with the record of the team that met none of the others', () => {
    // a and b split; c played neither. With no coin flip recorded all three stay level.
    const games = [
      final('a', 2, 'b', 1),
      final('b', 2, 'a', 1),
      final('c', 2, 'd', 1),
      final('e', 2, 'c', 1),
    ];
    const coinFirst: StandingsRules = { ...rules, tiebreakers: ['head-to-head', 'coin-flip'] };
    const rows = rowsOf(['a', 'b', 'c', 'd', 'e'], games, coinFirst);
    expect(rows.map((r) => `${r.teamId} ${r.rank} ${r.decidedBy}`)).toEqual([
      'e 1 null',
      'a 2 still-tied',
      'b 2 still-tied',
      'c 2 still-tied',
      'd 5 null',
    ]);
    expect(short(levelOf(rows, 'c'))).toEqual([
      'head-to-head passed-over a:1:1-1-0 b:1:1-1-0 c:1:0-0-0',
      'coin-flip passed-over a:1 b:1 c:1',
    ]);
  });

  it('gives the figure of fewest points allowed as the points allowed', () => {
    // All 1-1 in a circle; points allowed: a 30 + 45, c 40 + 45, b 50 + 44.
    const games = [final('a', 40, 'c', 30), final('c', 50, 'b', 45), final('b', 45, 'a', 44)];
    const fewest: StandingsRules = { ...rules, tiebreakers: ['fewest-points-allowed'] };
    const rows = rowsOf(['a', 'b', 'c'], games, fewest);
    expect(order(rows)).toEqual(['a', 'c', 'b']);
    expect(short(levelOf(rows, 'a'))).toEqual([
      'fewest-points-allowed applied a:1:75 c:2:85 b:3:94',
    ]);
  });

  it('in a points table, gives head-to-head records as wins, losses and ties', () => {
    const points: StandingsRules = {
      ...rules,
      standings: { rankBy: 'points', pointsPerWin: 3, pointsPerTie: 1, pointsPerLoss: 0 },
      tiebreakers: ['head-to-head'],
      allowTies: true,
    };
    // a and b both have 4 points: they drew, and each beat c once.
    const games = [final('a', 40, 'b', 40), final('a', 50, 'c', 40), final('b', 50, 'c', 40)];
    const rows = rowsOf(['a', 'b', 'c'], games, points);
    expect(rows.map((r) => `${r.teamId} ${r.points} ${r.decidedBy}`)).toEqual([
      'a 4 still-tied',
      'b 4 still-tied',
      'c 0 null',
    ]);
    expect(short(levelOf(rows, 'a'))).toEqual(['head-to-head applied a:1:0-0-1 b:1:0-0-1']);
  });
});

describe('level teams in made-up seasons (T-182)', () => {
  it('says, for every two neighbours of a level set, the step that put one above the other', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const result = calculateStandings(generatedSeason(seeded(seed)));
      for (const table of result.tables) {
        const ids = table.rows.map((row) => row.teamId);
        for (const [i, row] of table.rows.entries()) {
          // Level with nobody exactly when its record alone placed it.
          expect(row.level === null, `seed ${seed}`).toBe(row.decidedBy === null);
          if (row.level === null) continue;
          const level = row.level;
          expect(level.teamIds, `seed ${seed}`).toContain(row.teamId);
          // The level teams sit together, in the table's order.
          const start = ids.indexOf(level.teamIds[0] ?? '');
          expect(ids.slice(start, start + level.teamIds.length), `seed ${seed}`).toEqual(
            level.teamIds,
          );
          // Every step is among them, and the first is on all of them.
          if (level.steps[0]) {
            expect(level.steps[0].teams.map((t) => t.teamId).sort(), `seed ${seed}`).toEqual(
              [...level.teamIds].sort(),
            );
          }
          const next = table.rows[i + 1];
          if (next === undefined || !level.teamIds.includes(next.teamId)) continue;
          // What separates it from the next of them: a step that put it above, none that
          // put it below, or they share a place.
          const placeIn = (step: (typeof level.steps)[number], teamId: string) =>
            step.teams.find((t) => t.teamId === teamId)?.place;
          const both = level.steps.filter(
            (step) =>
              step.applied &&
              placeIn(step, row.teamId) !== undefined &&
              placeIn(step, next.teamId) !== undefined,
          );
          const above = both.filter(
            (s) => (placeIn(s, row.teamId) ?? 0) < (placeIn(s, next.teamId) ?? 0),
          );
          const below = both.filter(
            (s) => (placeIn(s, row.teamId) ?? 0) > (placeIn(s, next.teamId) ?? 0),
          );
          expect(below, `seed ${seed}`).toEqual([]);
          if (next.rank === row.rank) expect(above, `seed ${seed}`).toEqual([]);
          else expect(above, `seed ${seed}`).toHaveLength(1);
        }
      }
    }
  });
});
