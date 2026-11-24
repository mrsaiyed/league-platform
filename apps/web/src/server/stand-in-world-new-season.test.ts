// "Start a new season" on the made-up world (step 2.130): the same copy as the database's
// (copy-season-setup.ts, T-378), so the screens and browser tests run on it.
import { describe, expect, it } from 'vitest';
import {
  copyWorldSeasonSetup,
  createWorldSeason,
  currentWorldSeasonOf,
} from './stand-in-world-new-season.ts';
import { emptyLeagueWorld, type WorldRosterEntry } from './stand-in-world-state.ts';

function aWorld() {
  const s = emptyLeagueWorld(
    { id: 'league-1', slug: 'made-up', name: 'Made Up League' },
    { audience: 'adult', timeZone: 'America/Chicago' },
  );
  s.seasons = [
    {
      id: 'fall',
      programId: 'p1',
      programSlug: 'main',
      name: 'Fall',
      startsOn: null,
      endsOn: null,
      slug: 'fall',
      status: 'active',
      rules: { version: 1, made: 'up' },
      statKeys: ['points'],
      version: 3,
    },
  ];
  s.currentSeasonId = 'fall';
  const division = { seasonId: 'fall', color: null, binned: false, version: 1 };
  s.divisions = [
    { ...division, id: 'east', parentDivisionId: null, name: 'East', sort: 0 },
    { ...division, id: 'east-a', parentDivisionId: 'east', name: 'East A', sort: 1 },
    { ...division, id: 'gone', parentDivisionId: null, name: 'Gone', sort: 2, binned: true },
  ];
  const team = { seasonId: 'fall', color: null, statsVisibility: 'public', version: 2 };
  s.teams = [
    { ...team, id: 'owls', divisionId: 'east-a', slug: 'owls', name: 'Owls', lineageId: 'l-owls' },
    { ...team, id: 'herons', divisionId: null, slug: 'herons', name: 'Herons', lineageId: 'l-h' },
  ].map((t) => ({ ...t, binned: false, left: false }));
  s.teams.push({ ...s.teams[1]!, id: 'left', slug: 'left', lineageId: 'l-left', left: true });
  const entry = (id: string, leftOn: string | null): WorldRosterEntry => ({
    id,
    teamId: 'owls',
    personId: `person-${id}`,
    jerseyNumber: '7',
    role: 'player',
    joinedOn: '2026-09-01',
    leftOn,
    sort: 0,
    version: 1,
    addedAtGameId: null,
    needsReview: true,
  });
  s.roster = [entry('stays', null), entry('went', '2026-10-01')];
  s.settings = [
    {
      place: { level: 'season', seasonId: 'fall' },
      key: 'madeup.key',
      document: { version: 1, value: 3 },
      version: 4,
      savedAt: '2026-09-01T00:00:00Z',
    },
  ];
  return s;
}

describe('starting a new season on the stand-in world (step 2.130)', () => {
  it('makes a hidden draft, refuses a name taken in the program, and finds the current season', () => {
    const s = aWorld();
    expect(currentWorldSeasonOf(s, 'p1')).toBe('fall');
    expect(currentWorldSeasonOf(s, 'p2')).toBeUndefined();
    const id = createWorldSeason(s, {
      programId: 'p1',
      slug: 'winter',
      name: 'Winter 2027',
      startsOn: '2027-01-05',
      endsOn: null,
    });
    expect(s.seasons.find((x) => x.id === id)).toMatchObject({
      status: 'draft',
      programSlug: 'main',
      rules: { version: 1 },
      statKeys: [],
    });
    expect(s.currentSeasonId).toBe('fall');
    expect(
      createWorldSeason(s, {
        programId: 'p1',
        slug: 'fall',
        name: 'X',
        startsOn: null,
        endsOn: null,
      }),
    ).toBe('slug-taken');
  });

  it('copies rules, settings and divisions, and the teams and rosters only when asked', () => {
    const s = aWorld();
    const id = createWorldSeason(s, {
      programId: 'p1',
      slug: 'winter',
      name: 'Winter',
      startsOn: null,
      endsOn: null,
    });
    if (id === 'slug-taken') throw new Error(id);
    const copied = copyWorldSeasonSetup(s, {
      fromSeasonId: 'fall',
      toSeasonId: id,
      teams: true,
      rosters: true,
    });
    expect(copied).toEqual({ divisions: 2, teams: 2, rosterEntries: 1 });
    expect(s.seasons.find((x) => x.id === id)).toMatchObject({
      rules: { version: 1, made: 'up' },
      statKeys: ['points'],
    });
    // Not its settings (record 065): only the settings commands write one.
    expect(s.settings.filter((x) => x.place.level === 'season' && x.place.seasonId === id)).toEqual(
      [],
    );
    const divisions = s.divisions.filter((d) => d.seasonId === id);
    const east = divisions.find((d) => d.name === 'East');
    expect(divisions.find((d) => d.name === 'East A')?.parentDivisionId).toBe(east?.id);
    const owls = s.teams.find((t) => t.seasonId === id && t.lineageId === 'l-owls');
    expect(owls?.divisionId).toBe(divisions.find((d) => d.name === 'East A')?.id);
    expect(s.roster.filter((r) => r.teamId === owls?.id)).toMatchObject([
      { personId: 'person-stays', jerseyNumber: '7', joinedOn: null, needsReview: false },
    ]);
    const fresh = createWorldSeason(s, {
      programId: 'p1',
      slug: 'spring',
      name: 'Spring',
      startsOn: null,
      endsOn: null,
    });
    if (fresh === 'slug-taken') throw new Error(fresh);
    expect(
      copyWorldSeasonSetup(s, {
        fromSeasonId: 'fall',
        toSeasonId: fresh,
        teams: false,
        rosters: false,
      }),
    ).toEqual({ divisions: 2, teams: 0, rosterEntries: 0 });
  });
});
