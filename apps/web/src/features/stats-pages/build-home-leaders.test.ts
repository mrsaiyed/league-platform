// The home page's leaders (step 2.147 part 2), on the made-up stand-in: who is named, how
// their name is written, and who is never named.
import { describe, expect, it } from 'vitest';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { homeLeaderLimit, loadHomeLeaders } from './build-home-leaders.ts';
import { loadStatsPage } from './build-stats.ts';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const stats = standInPublicStats({ adultLeagueId: adult, youthLeagueId: youth });

async function leadersOf(leagueId: string) {
  const season = (await stats.seasonsOf(leagueId))[0];
  if (season === undefined) throw new Error('no season');
  const store = stats.readStoreOf(leagueId);
  const settings = await stats.settingsOf(leagueId);
  const input = { leagueId, seasonId: season.id };
  const page = await loadStatsPage(store, settings, { ...input, by: 'average' });
  if ('code' in page) throw new Error(page.code);
  return { leaders: await loadHomeLeaders(store, settings, input), page };
}

describe('the home page’s leaders', () => {
  it('are the first three of the statistics page’s first board, per game, each with its place', async () => {
    const { leaders, page } = await leadersOf(adult);
    expect(leaders.length).toBeGreaterThan(0);
    expect(leaders.length).toBeLessThanOrEqual(homeLeaderLimit);
    const board = page.leaders[0];
    expect(board?.key).toBe('points');
    // The same people in the same order, and the same numbers, as the statistics page.
    expect(leaders.map((leader) => leader.id)).toEqual(
      board?.rows.slice(0, leaders.length).map((row) => row.id),
    );
    expect(leaders.map((leader) => leader.value)).toEqual(
      board?.rows.slice(0, leaders.length).map((row) => row.cells['value']),
    );
    expect(leaders.map((leader) => leader.label)).toEqual(
      ['01 / Points', '02 / Points', '03 / Points'].slice(0, leaders.length),
    );
    for (const leader of leaders) {
      expect(leader.unit).toBe('per game');
      expect(leader.value).toMatch(/^\d+\.\d$/);
      expect(leader.detail).toMatch(/^.+ · \d+ games?$/);
    }
  });

  it('write a name only as the statistics page does: by the league’s own name setting', async () => {
    for (const league of [adult, youth]) {
      const { leaders, page } = await leadersOf(league);
      const names = new Map(page.playerRows.map((row) => [row.id, row.cells['player']]));
      for (const leader of leaders) expect(leader.name).toBe(names.get(leader.id));
    }
    // The youth league shows a first name and an initial, never a family name.
    const { leaders } = await leadersOf(youth);
    expect(leaders.length).toBeGreaterThan(0);
    for (const leader of leaders) expect(leader.name).toMatch(/^\S+ \S\.$/u);
  });

  it('never name a player of a team whose numbers are staff only', async () => {
    const { leaders, page } = await leadersOf(adult);
    // The stand-in has such a team: the statistics page says only its totals are shown.
    expect(page.totalsOnlyTeams.length).toBeGreaterThan(0);
    for (const leader of leaders) {
      for (const team of page.totalsOnlyTeams) expect(leader.detail).not.toContain(team);
      expect(page.totalsOnlyTeams).not.toContain(leader.team?.name);
    }
  });

  it('carry the team’s shield for a player of one team', async () => {
    const { leaders } = await leadersOf(adult);
    for (const leader of leaders) {
      if (leader.team === undefined) continue;
      expect(leader.detail.startsWith(`${leader.team.name} · `)).toBe(true);
    }
    expect(leaders.some((leader) => leader.team !== undefined)).toBe(true);
  });

  it('are none for a season that is not there', async () => {
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    expect(
      await loadHomeLeaders(store, settings, {
        leagueId: adult,
        seasonId: '01900000-0000-7000-8000-00000000ffff',
      }),
    ).toEqual([]);
  });
});
