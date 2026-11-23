import type { BinListing } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { binView, nameTakenBy } from './bin-view.ts';

const at = '2026-11-20T18:00:00.000Z';
const base = { secondName: null, seasonId: 's-1', binnedAt: at, removedForGoodAt: null };
const times = { locale: 'en', timeZone: 'UTC' };

describe('what the bin screen shows (step 2.77)', () => {
  it("tells a team's games and who on its roster is in the bin too", () => {
    const items: BinListing[] = [
      {
        ...base,
        kind: 'team',
        id: 't-1',
        name: 'Hawks',
        kept: true,
        details: {
          gamesPlayed: 3,
          gamesToCome: 2,
          rosterInBin: ['p-1'],
          seasonName: 'Winter 2027',
          divisionName: 'Boys U12',
        },
      },
      { ...base, kind: 'person', id: 'p-1', name: 'Sam Player', seasonId: null, kept: true },
    ];
    const view = binView(items, times);
    expect(view.team[0]?.facts).toEqual([
      'Season: Winter 2027.',
      'Division: Boys U12.',
      'Games played: 3. Games still to play: 2. They come back with it.',
      'On its roster and in the bin too: Sam Player. The team comes back without them on the league list: bring them back as well, under Removed people.',
    ]);
    expect(view.person.map((p) => p.title)).toEqual(['Sam Player']);
  });

  it('tells a game by its season, its day and the team of it in the bin', () => {
    const items: BinListing[] = [
      {
        ...base,
        kind: 'game',
        id: 'g-1',
        name: 'Hawks',
        secondName: 'Owls',
        kept: true,
        details: {
          startsAt: null,
          withoutRound: true,
          seasonName: 'Winter 2027',
          teamsInBin: [{ id: 't-1', name: 'Hawks' }],
        },
      },
    ];
    const game = binView(items, times).game[0];
    expect(game?.title).toBe('Hawks against Owls');
    expect(game?.facts[0]).toBe('Season: Winter 2027.');
    expect(game?.facts).toContain('It has no round now, so it comes back with no round.');
    // The team is not in this person's part: they ask an admin.
    expect(game?.facts).toContain(
      'Its team in the bin: Hawks. Ask an admin to bring the team back.',
    );
    expect(game?.teamsInBin).toEqual([{ id: 't-1', name: 'Hawks' }]);
  });

  it('says both teams of a game in the bin, and to bring them back to whoever may', () => {
    const team = (id: string, name: string): BinListing => ({
      ...base,
      kind: 'team',
      id,
      name,
      kept: true,
    });
    const items: BinListing[] = [
      team('t-1', 'Hawks'),
      team('t-2', 'Owls'),
      {
        ...base,
        kind: 'game',
        id: 'g-1',
        name: 'Hawks',
        secondName: 'Owls',
        kept: true,
        details: {
          teamsInBin: [
            { id: 't-1', name: 'Hawks' },
            { id: 't-2', name: 'Owls' },
          ],
        },
      },
    ];
    expect(binView(items, times).game[0]?.facts).toContain(
      'Its teams Hawks and Owls are in the bin. Bring the teams back first.',
    );
  });

  it("counts a team's binned roster, unnamed, for whoever does not see the people", () => {
    const items: BinListing[] = [
      {
        ...base,
        kind: 'team',
        id: 't-1',
        name: 'Hawks',
        kept: true,
        details: { rosterInBin: ['p-1', 'p-2'] },
      },
    ];
    expect(binView(items, times).team[0]?.facts).toContain(
      'On its roster and in the bin too: 2 people. The team comes back without them on the league list.',
    );
  });

  it('lists divisions with their season, venues, and courts with their venue', () => {
    const items: BinListing[] = [
      {
        ...base,
        kind: 'division',
        id: 'd-1',
        name: 'Girls',
        kept: false,
        details: { seasonName: 'Winter 2027' },
      },
      { ...base, kind: 'venue', id: 'v-1', name: 'North Hall', seasonId: null, kept: false },
      {
        ...base,
        kind: 'court',
        id: 'c-1',
        name: 'Court 1',
        seasonId: null,
        kept: false,
        details: { venueName: 'South Hall' },
      },
    ];
    const view = binView(items, times);
    expect(view.division[0]?.facts).toEqual(['Season: Winter 2027.']);
    expect(view.venue.map((v) => v.title)).toEqual(['North Hall']);
    expect(view.court[0]?.facts).toEqual(['At South Hall.']);
    expect([...view.team, ...view.person, ...view.game]).toEqual([]);
  });
});

describe('the team that took a binned team’s name (S-83)', () => {
  it('is the other team of the season with the same name, whatever its capitals', () => {
    const teams = [
      { id: 'x', name: 'Hawks' },
      { id: 'y', name: ' riverside hawks ' },
    ];
    expect(nameTakenBy({ id: 'x', name: 'Riverside Hawks' }, teams)?.id).toBe('y');
    expect(nameTakenBy({ id: 'y', name: 'Riverside Hawks' }, teams)).toBeUndefined();
  });
});
