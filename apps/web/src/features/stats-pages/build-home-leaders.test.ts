// The home page's leaders (step 2.147 part 2), on the made-up stand-in: who is named, how
// their name is written, and who is never named.
import { publicViewer, readStatLeaders, type StandingsReadStore } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { homeLeaderLimit, homeLeadersOf, loadHomeLeaders } from './build-home-leaders.ts';
import { loadStatsPage } from './build-stats.ts';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const stats = standInPublicStats(testWorld(), startingNamePolicy);

/** A leader board row's name without its place: "2. Dana W." is "Dana W.". */
const nameIn = (cell: unknown) => String(cell).replace(/^\d+\. /u, '');

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
    expect(leaders.map((leader) => leader.name)).toEqual(
      board?.rows.slice(0, leaders.length).map((row) => nameIn(row.cells['player'])),
    );
    // Each one's key is its place on this page, never a person's id (T-81).
    expect(leaders.map((leader) => leader.id)).toEqual(
      ['leader-0', 'leader-1', 'leader-2'].slice(0, leaders.length),
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
      const board = page.leaders[0]?.rows ?? [];
      const shown = new Set(page.playerRows.map((row) => row.cells['player']));
      for (const [place, leader] of leaders.entries()) {
        expect(leader.name).toBe(nameIn(board[place]?.cells['player']));
        expect(shown).toContain(leader.name);
      }
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

  it('never lead with fouls or turnovers, even where the sport lists them first (S-48)', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const store = stats.readStoreOf(adult);
    const keys = (await store.seasonStatKeys(season.id)) ?? [];
    const fouled: StandingsReadStore = {
      ...store,
      seasonStatKeys: async () => [
        'fouls',
        'turnovers',
        ...keys.filter((key) => key !== 'fouls' && key !== 'turnovers'),
      ],
    };
    const leaders = await loadHomeLeaders(fouled, await stats.settingsOf(adult), {
      leagueId: adult,
      seasonId: season.id,
    });
    expect(leaders.length).toBeGreaterThan(0);
    for (const leader of leaders) expect(leader.label).toMatch(/^\d\d \/ Points$/);
    // A sport with nothing but those two has no leader card at all.
    const only: StandingsReadStore = {
      ...store,
      seasonStatKeys: async () => ['fouls', 'turnovers'],
    };
    expect(
      await loadHomeLeaders(only, await stats.settingsOf(adult), {
        leagueId: adult,
        seasonId: season.id,
      }),
    ).toEqual([]);
  });

  it('give players who are level the same place, as the statistics page does', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    const totals = await store.playerTotals(season.id);
    const first = totals[0];
    if (first === undefined) throw new Error('no totals');
    // Every player has the same numbers: everyone is level.
    const level: StandingsReadStore = {
      ...store,
      playerTotals: async () =>
        totals.map((row) => ({ ...row, stats: first.stats, gamesPlayed: first.gamesPlayed })),
    };
    const input = { leagueId: adult, seasonId: season.id };
    const leaders = await loadHomeLeaders(level, settings, input);
    expect(leaders.map((leader) => leader.label)).toEqual([
      '01 / Points',
      '01 / Points',
      '01 / Points',
    ]);
    const page = await loadStatsPage(level, settings, { ...input, by: 'average' });
    if ('code' in page) throw new Error(page.code);
    expect(
      page.leaders[0]?.rows.slice(0, 3).map((row) => String(row.cells['player']).slice(0, 2)),
    ).toEqual(['1.', '1.', '1.']);
  });

  it('show a person who was taken off, or who asked for initials, as the statistics page does', async () => {
    const season = (await stats.seasonsOf(youth))[0];
    if (season === undefined) throw new Error('no season');
    const store = stats.readStoreOf(youth);
    const settings = await stats.settingsOf(youth);
    const input = { leagueId: youth, seasonId: season.id };
    // The first two leaders as core ranks them for the home page: by points, per game.
    const ranked = await readStatLeaders(
      store,
      { ...input, measure: 'points', by: 'average', minimumGames: settings.minimumGames },
      {
        leagueId: youth,
        viewer: publicViewer(youth),
        audience: settings.audience,
        policy: settings.namePolicy,
      },
    );
    if (!ranked.ok) throw new Error(ranked.error.code);
    const [first, second] = ranked.value.leaders;
    if (first === undefined || second === undefined) throw new Error('fewer than two leaders');
    const firstName = first.name.text ?? '';
    const changed: StandingsReadStore = {
      ...store,
      people: async (ids) =>
        (await store.people(ids)).map((person) => ({
          ...person,
          isMinor: true,
          visibility:
            person.id === first.personId
              ? 'removed'
              : person.id === second.personId
                ? 'initials'
                : person.visibility,
        })),
    };
    const after = await loadHomeLeaders(changed, settings, input);
    const page = await loadStatsPage(changed, settings, { ...input, by: 'average' });
    if ('code' in page) throw new Error(page.code);
    const board = page.leaders[0]?.rows ?? [];
    for (const [place, leader] of after.entries()) {
      expect(leader.name).toBe(nameIn(board[place]?.cells['player']));
    }
    // A name changes nothing of the order: the one taken off has no name at all; the other
    // is two initials.
    expect(after[0]?.name).toBe('A player (name not shown)');
    expect(after[1]?.name).toMatch(/^\S\. \S\.$/u);
    expect(firstName).not.toBe('');
    expect(JSON.stringify(after)).not.toContain(firstName);
  });

  it('are left out when the statistics cannot be read, and never take the page down', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    const input = { leagueId: adult, seasonId: season.id };
    const broken: StandingsReadStore = {
      ...store,
      playerTotals: async () => {
        throw new Error('database unreachable');
      },
    };
    await expect(loadHomeLeaders(broken, settings, input)).resolves.toEqual([]);
    // The same when it is the league's settings, read with them, that cannot be read.
    await expect(
      homeLeadersOf(
        {
          statisticsOf: async () => {
            throw new Error('database unreachable');
          },
        },
        input,
      ),
    ).resolves.toEqual([]);
    expect((await homeLeadersOf(stats, input)).length).toBeGreaterThan(0);
  });

  it('read the season’s numbers once for one visit', async () => {
    const season = (await stats.seasonsOf(youth))[0];
    if (season === undefined) throw new Error('no season');
    const store = stats.readStoreOf(youth);
    const calls = new Map<string, number>();
    const counted = Object.fromEntries(
      Object.entries(store).map(([name, read]) => [
        name,
        typeof read === 'function'
          ? (...args: readonly unknown[]) => {
              calls.set(name, (calls.get(name) ?? 0) + 1);
              return Reflect.apply(read, store, args);
            }
          : read,
      ]),
    ) as StandingsReadStore;
    const leaders = await loadHomeLeaders(counted, await stats.settingsOf(youth), {
      leagueId: youth,
      seasonId: season.id,
    });
    expect(leaders.length).toBeGreaterThan(0);
    expect(calls.get('playerTotals')).toBe(1);
    // No read of the store is made twice with the same question.
    expect(Math.max(...calls.values())).toBe(1);
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
