// A box score's Total counts everything the team did (step 2.196), played through core's
// own commands on the made-up world: a game scored on the tablet with a turnover charged
// to the team (the numbers audit's case 18), in a season keeping the full set, read by the
// page's own builder and the season's team totals. And a game that kept the full set when
// it was played, in a season that keeps the standard set now: its page's columns are the
// statistics page's. The same on the database is the agreement scenario's
// (server/stand-in-world-agrees.test.ts).
import {
  applyTrackerCommands,
  defaultNamePolicy,
  openScoringSession,
  publicViewer,
  readGamePage,
  readStatisticsTable,
  rulesOfGame,
  type CommandContext,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { standInPeople } from '../../server/stand-in-cast.ts';
import { standInGames } from '../../server/stand-in-games.ts';
import { worldGameSnapshot } from '../../server/stand-in-world-reads.ts';
import { worldStandingsRead } from '../../server/stand-in-world-standings.ts';
import type { LeagueWorld } from '../../server/stand-in-world-state.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { bears, games, hawks, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import { buildBoxScores } from './build-game.ts';

const as: CommandContext = {
  leagueId: liveLeagueId,
  accountId: standInPeople.owner.accountId,
  requestId: 'totals',
};
const viewing = {
  leagueId: liveLeagueId,
  viewer: publicViewer(liveLeagueId),
  audience: 'adult' as const,
  policy: defaultNamePolicy,
};

/** The made-up world with the Hawks v Bears game's season keeping `statistics`. */
function worldWith(
  statistics: 'standard' | 'full',
  gameKeeps?: 'standard' | 'full',
): ReturnType<typeof testWorld> {
  return testWorld(undefined, undefined, (leagues: LeagueWorld[]) => {
    const league = leagues.find((l) => l.leagueId === liveLeagueId);
    const game = league?.games.find((g) => g.id === games.hawksBears);
    if (league === undefined || game === undefined) throw new Error('no game');
    const rules = (keeps: 'standard' | 'full') => ({
      ...rulesOfGame(null, league.seasons.find((x) => x.id === game.seasonId)?.rules),
      statistics: keeps,
    });
    league.seasons = league.seasons.map((x) =>
      x.id === game.seasonId ? { ...x, rules: rules(statistics), statKeys: [] } : x,
    );
    // A game that was played under rules of its own (S-1): what the season kept then.
    if (gameKeeps !== undefined) {
      league.games = league.games.map((g) =>
        g.id === game.id ? { ...g, format: rules(gameKeeps) } : g,
      );
    }
  });
}

/** Hawks v Bears on the tablet, through core's commands, and ended. */
async function play(world: ReturnType<typeof testWorld>, taps: readonly unknown[]) {
  const ports = standInGames(world, {
    people: {},
    namesShownOf: async () => ({ audience: 'adult', policy: defaultNamePolicy }),
  });
  const session = await openScoringSession(
    as,
    { gameId: games.hawksBears, deviceId: 'totals-tablet' },
    ports.deps,
  );
  if (!session.ok || session.value.status !== 'held-by-you') throw new Error('no session');
  const from = world.now().getTime() - 60_000;
  const result = await applyTrackerCommands(
    as,
    {
      gameId: games.hawksBears,
      protocolVersion: 1,
      sessionId: session.value.sessionId,
      commands: [
        { type: 'lineup', side: 'home', playerIds: hawks },
        { type: 'lineup', side: 'away', playerIds: bears },
        { type: 'start' },
        ...taps,
        { type: 'end' },
      ].map((input, i) => ({ commandId: randomUUID(), at: from + i * 1000, input })),
    },
    ports.deps,
  );
  if (!result.ok) throw new Error(result.error.code);
  const page = await readGamePage(
    worldGameSnapshot(() => world.read(liveLeagueId), world.now),
    { gameId: games.hawksBears },
    viewing,
  );
  if (!page.ok) throw new Error('no page');
  const statistics = await readStatisticsTable(
    worldStandingsRead(() => world.read(liveLeagueId), world.now),
    { seasonId: page.value.game.seasonId, viewing },
  );
  if (!statistics.ok) throw new Error('no statistics');
  const built = buildBoxScores(page.value);
  if (built.kind !== 'tables') throw new Error(built.kind);
  return { page: page.value, tables: built.tables, statistics: statistics.value };
}

describe("a box score's Total, played through core's commands (step 2.196)", () => {
  it("case 18 in a full-set season: the Hawks' Total of turnovers is 2, with the sentence, and so is their season's", async () => {
    const { page, tables, statistics } = await play(worldWith('full'), [
      { type: 'score', side: 'home', playerId: hawks[0], points: 3 },
      { type: 'team-turnover', side: 'home' },
      { type: 'turnover', side: 'home', playerId: hawks[2] },
      { type: 'score', side: 'away', playerId: bears[0], points: 2 },
    ]);
    expect(page.game.status).toBe('final');
    const hawksTable = tables.find((x) => x.teamName === 'Hawks');
    if (hawksTable === undefined || hawksTable.players === null) throw new Error('no Hawks');
    expect(hawksTable.columns.map((c) => c.key)).toEqual([
      'points',
      'fg3',
      'fg1',
      'fouls',
      'turnovers',
    ]);
    // Every column is its players added up, but turnovers, which the sentence explains
    // exactly: the team's own one.
    for (const column of hawksTable.columns) {
      const sum = hawksTable.players.reduce((n, p) => n + Number(p.cells[column.key] ?? 0), 0);
      expect(hawksTable.totals[column.key], column.key).toBe(
        column.key === 'turnovers' ? sum + 1 : sum,
      );
    }
    expect(hawksTable.totals['turnovers']).toBe(2);
    expect(hawksTable.notes).toEqual([
      'The Total includes 1 turnover charged to the team, not to a player.',
    ]);
    // The Bears were charged none of their own: no sentence.
    expect(tables.find((x) => x.teamName === 'Bears')?.notes).toEqual([]);
    // The season's team totals: the same 2 (the season's other games recorded none).
    expect(statistics.statKeys).toContain('turnovers');
    const hawksId = page.boxScores.find((box) => box.name === 'Hawks')?.teamId;
    expect(statistics.teams.find((t) => t.teamId === hawksId)?.stats['turnovers']).toMatchObject({
      total: 2,
      gamesRecorded: 1,
    });
  });

  it('gives a game that kept the full set the columns its season keeps now, as the statistics page does', async () => {
    const { tables, statistics } = await play(worldWith('standard', 'full'), [
      { type: 'score', side: 'home', playerId: hawks[0], points: 3 },
      { type: 'team-turnover', side: 'home' },
    ]);
    expect(statistics.statKeys).toEqual(['points', 'fg3', 'fg1', 'fouls']);
    for (const table of tables) {
      expect(table.columns.map((c) => c.key)).toEqual(['points', 'fg3', 'fg1', 'fouls']);
      expect(table.notes).toEqual([]);
    }
  });
});
