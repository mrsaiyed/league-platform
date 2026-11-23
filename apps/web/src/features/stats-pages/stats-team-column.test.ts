// The Team column names only the teams a player has numbers with (step 2.199; the numbers
// audit's L2, case 36), through the product on the made-up database: an Otters player is
// put on the Herons' roster too and marked as left before playing for them, then scores
// for the Otters in a box score. The roster place still counts for who may see whose
// numbers (S-22), but the statistics page's Team column, on the leaders and in the full
// table, names the Otters only, and the season rebuilt from the box score counts one game.
import { addToRoster, markLeft, setBoxScore } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gamesWorld, type GamesWorld } from '../../server/database-games.test-helper.ts';
import { loadStatsPage, type StatsPageData } from './build-stats.ts';

let w: GamesWorld;

beforeAll(async () => {
  w = await gamesWorld({ byHand: 1, live: 0 });
}, 300_000);

afterAll(async () => {
  await w.close();
});

/** The statistics page of Lakeside's season, per game, as a visitor reads it. */
async function page(): Promise<StatsPageData> {
  const data = await w.ports.publicStats.statisticsOf(w.leagueId, ({ store, settings }) =>
    loadStatsPage(store, settings, { leagueId: w.leagueId, seasonId: w.seasonId, by: 'average' }),
  );
  if ('code' in data) throw new Error(data.code);
  return data;
}

describe('the Team column after a player left a team before playing for it (case 36)', () => {
  it('names only the team the player scored for, on the leaders and in the full table', async () => {
    const mover = w.players.otters[0] ?? '';
    const added = await addToRoster(
      w.asOwner,
      { teamId: w.herons, personId: mover, jerseyNumber: '99', role: 'player' },
      w.ports.adminTeams.deps,
    );
    if (!added.ok) throw new Error(`not added: ${added.error.code}`);
    expect(
      await markLeft(
        w.asOwner,
        { rosterEntryId: added.value.rosterEntryId, version: 1, leftOn: '2026-01-02' },
        w.ports.adminTeams.deps,
      ),
    ).toMatchObject({ ok: true });

    // The box score: the mover scores 30 for the Otters, more than anyone in the season.
    const game = w.take(w.byHand);
    const line = (teamId: string, personId: string, points: number) => ({
      teamId,
      personId,
      played: true,
      secondsPlayed: null,
      stats: { points },
    });
    expect(
      await setBoxScore(
        w.contextOf('scheduler'),
        {
          gameId: game,
          version: await w.versionOf(game),
          homeScore: 10,
          awayScore: 30,
          lines: [
            ...w.players.herons.map((id, n) => line(w.herons, id, n === 0 ? 10 : 0)),
            ...w.players.otters.map((id) => line(w.otters, id, id === mover ? 30 : 0)),
          ],
        },
        w.ports.games.deps,
      ),
    ).toMatchObject({ ok: true });

    const data = await page();
    const row = data.playerRows.find((r) => r.cells['player'] === 'Player40 Otterfamily');
    expect(row?.cells['team']).toBe('Lakeside Otters');
    expect(row?.cells['games']).toBe(1);
    expect(row?.severalTeams).toBeUndefined();
    const points = data.leaders.find((board) => board.key === 'points');
    expect(points?.rows[0]?.cells).toMatchObject({
      player: '1. Player40 Otterfamily',
      team: 'Lakeside Otters',
      games: 1,
      value: '30.0',
    });
    expect(points?.first).toMatchObject({
      name: 'Player40 Otterfamily',
      teams: 'Lakeside Otters',
      team: { name: 'Lakeside Otters' },
    });
    expect(JSON.stringify(data)).not.toContain('Lakeside Herons, Lakeside Otters');
  });
});
