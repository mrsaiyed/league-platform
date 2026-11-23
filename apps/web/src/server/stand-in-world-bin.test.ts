import { describe, expect, it } from 'vitest';
import { standInSeedCast } from './stand-in-cast.ts';
import { worldBinStore } from './stand-in-world-bin.ts';
import { binTeamOfFirstLeague } from './stand-in-world-binned-team.ts';
import { madeUpLeagues } from './stand-in-world-seed.ts';
import { emptyLeagueWorld, type WorldPerson } from './stand-in-world-state.ts';

const ada: WorldPerson = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovell',
  publicName: null,
  visibility: 'none',
  binned: true,
  version: 2,
  sensitive: { contactEmail: 'ada@example.test', birthDate: null, isMinor: null },
  accountId: null,
};

function worldWithAda() {
  const s = emptyLeagueWorld(
    { id: 'league-1', slug: 'made-up', name: 'Made Up' },
    { audience: 'adult', timeZone: 'UTC' },
  );
  s.people = [ada];
  return s;
}

describe('the made-up world’s bin, for a person', () => {
  it('finds a person in the bin and brings them back as they were', async () => {
    const s = worldWithAda();
    const bin = worldBinStore(s);
    expect(await bin.findPerson(ada.id)).toEqual({ binned: true });
    expect(await bin.restorePerson(ada.id)).toBe(true);
    expect(s.people[0]).toEqual({ ...ada, binned: false, version: 3 });
    expect(await bin.findPerson(ada.id)).toEqual({ binned: false });
  });

  it('knows no one who is not in the league', async () => {
    const bin = worldBinStore(worldWithAda());
    expect(await bin.findPerson('00000000-0000-4000-8000-000000000009')).toBeUndefined();
    expect(await bin.restorePerson('00000000-0000-4000-8000-000000000009')).toBe(false);
  });

  it('says what it does not do yet, rather than doing it wrong', async () => {
    await expect(worldBinStore(worldWithAda()).purge(new Date())).rejects.toThrow(
      'Not on the stand-in yet',
    );
  });

  it('lists a person in the bin by name', async () => {
    const listed = await worldBinStore(worldWithAda()).list();
    expect(listed.map((i) => [i.kind, i.id, i.name])).toEqual([['person', ada.id, 'Ada Lovell']]);
  });
});

describe('the made-up world’s bin, for a team and a game (step 2.77)', () => {
  const firstLeague = () => {
    const leagues = madeUpLeagues(standInSeedCast, new Date('2026-11-16T18:00:00Z'));
    binTeamOfFirstLeague(leagues, 'badgers');
    const s = leagues[0];
    if (s === undefined) throw new Error('no league');
    return s;
  };

  it('lists a team with its games played and to come, and brings it back', async () => {
    const s = firstLeague();
    const bin = worldBinStore(s);
    const team = (await bin.list()).find((i) => i.kind === 'team');
    expect(team?.name).toBe('Badgers');
    expect((team?.details?.gamesPlayed ?? 0) + (team?.details?.gamesToCome ?? 0)).toBeGreaterThan(
      0,
    );
    expect(await bin.restoreTeam(team?.id ?? '')).toBe(true);
    expect(await bin.list()).toEqual([]);
  });

  it('refuses a team whose name another team of the season took meanwhile', async () => {
    const s = firstLeague();
    const binned = s.teams.find((t) => t.binned);
    const other = s.teams.find((t) => !t.binned && t.seasonId === binned?.seasonId);
    if (binned === undefined || other === undefined) throw new Error('no teams');
    s.teams = s.teams.map((t) => (t === other ? { ...t, name: 'BADGERS' } : t));
    expect(await worldBinStore(s).restoreTeam(binned.id)).toBe('name-taken');
  });

  it('keeps a game in the bin while one of its teams is there', async () => {
    const s = firstLeague();
    const binned = s.teams.find((t) => t.binned);
    const at = s.games.findIndex(
      (g) =>
        g.status === 'scheduled' && (g.homeTeamId === binned?.id || g.awayTeamId === binned?.id),
    );
    const game = s.games[at];
    if (game === undefined) throw new Error('no game');
    s.games = s.games.map((g, i) => (i === at ? { ...g, binned: true, roundId: null } : g));
    const bin = worldBinStore(s);
    expect(await bin.findGame(game.id)).toMatchObject({ binned: true, partInBin: true });
    const listed = (await bin.list()).find((i) => i.id === game.id);
    expect(listed?.details?.withoutRound).toBe(true);
  });
});
