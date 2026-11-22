// readStandings hands each group of level teams the engine's steps (step 2.198) only when
// every row of the group keeps the same account of exactly those teams; otherwise "not
// known", so the page says no more than the rows can bear.
import { defaultSeasonRules } from '@srleagues/contracts';
import { calculateStandings } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { levelDocument } from '../level-document.ts';
import { memoryStandingsRead, seasonId } from '../memory-standings-read.test-helper.ts';
import type { StandingsReadStore, StandingsRowRecord } from '../read-ports.ts';
import { readStandings } from './read-standings.ts';

const names = ['Otters', 'Lions', 'Tigers', 'Hawks', 'Bears', 'Badgers'];

/** Case 46's West: Lions, Tigers, Hawks and Bears all 1-1. */
function engineRows(): StandingsRowRecord[] {
  const games = [
    ['Tigers', 55, 'Hawks', 48],
    ['Hawks', 51, 'Tigers', 47],
    ['Bears', 60, 'Badgers', 52],
    ['Otters', 58, 'Lions', 49],
    ['Lions', 50, 'Bears', 44],
  ] as const;
  const result = calculateStandings({
    teams: names.map((teamId) => ({ teamId, divisionId: null })),
    games: games.map(([home, homeScore, away, awayScore], n) => ({
      gameId: `g${n}`,
      status: 'final',
      homeTeamId: home,
      awayTeamId: away,
      homeScore,
      awayScore,
      winnerTeamId: null,
      startsAt: new Date(Date.UTC(2026, 8, 1 + n)).toISOString(),
    })),
    rules: defaultSeasonRules(),
  });
  return result.tables.flatMap((table) =>
    table.rows.map((row) => ({
      teamId: row.teamId,
      divisionId: row.divisionId,
      rank: row.rank,
      seed: row.seed,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      standingsPoints: row.points,
      streakResult: row.streak?.result ?? null,
      streakLength: row.streak?.length ?? null,
      decidedBy: row.decidedBy,
      level: JSON.parse(JSON.stringify(levelDocument(row.level))),
    })),
  );
}

function storeOf(
  rows: readonly StandingsRowRecord[],
  shown: readonly string[] = names,
): StandingsReadStore {
  return {
    ...memoryStandingsRead(),
    teams: async () =>
      shown.map((name) => ({
        id: name,
        name,
        slug: name.toLowerCase(),
        color: null,
        divisionId: null,
        statsVisibility: 'everyone',
        removed: false,
      })),
    divisions: async () => [],
    standingsRows: async () => rows,
    adjustments: async () => [],
    decidedGames: async () => [],
  };
}

async function groupsOf(store: StandingsReadStore) {
  const result = await readStandings(store, { seasonId });
  if (!result.ok) throw new Error('expected standings');
  return result.value.tables.flatMap((table) => table.levelGroups);
}

describe('readStandings: how level teams were ordered', () => {
  it('gives the steps the rows keep, for exactly the teams they name', async () => {
    const [group] = await groupsOf(storeOf(engineRows()));
    expect(group?.teamIds).toEqual(['Lions', 'Tigers', 'Hawks', 'Bears']);
    expect(group?.steps?.map((step) => step.tiebreaker)).toEqual([
      'head-to-head',
      'head-to-head',
      'point-difference',
    ]);
    expect(group?.steps?.[0]?.teams.map((t) => [t.teamId, t.place, t.record?.wins])).toEqual([
      ['Lions', 1, 1],
      ['Hawks', 2, 1],
      ['Tigers', 2, 1],
      ['Bears', 4, 0],
    ]);
  });

  it('gives none when a row keeps none, two rows disagree, or a team named is not shown', async () => {
    const withoutOne = engineRows().map((row) =>
      row.teamId === 'Hawks' ? { ...row, level: null } : row,
    );
    expect((await groupsOf(storeOf(withoutOne)))[0]?.steps).toBeNull();
    const rows = engineRows();
    const other = rows.find((row) => row.teamId === 'Tigers');
    const disagreeing = rows.map((row) =>
      row.teamId === 'Bears' && other
        ? { ...row, level: { ...(other.level as object), steps: [] } }
        : row,
    );
    expect((await groupsOf(storeOf(disagreeing)))[0]?.steps).toBeNull();
    // The Bears in the bin: their row stays until the next rebuild, and is not shown.
    const binned = await groupsOf(
      storeOf(engineRows(), ['Otters', 'Lions', 'Tigers', 'Hawks', 'Badgers']),
    );
    expect(binned[0]?.teamIds).toEqual(['Lions', 'Tigers', 'Hawks']);
    expect(binned[0]?.steps).toBeNull();
    // A document it cannot read.
    const unreadable = engineRows().map((row) =>
      row.level === null ? row : { ...row, level: { version: 9 } },
    );
    expect((await groupsOf(storeOf(unreadable)))[0]?.steps).toBeNull();
  });
});
