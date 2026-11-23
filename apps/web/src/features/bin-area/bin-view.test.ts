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
        details: { gamesPlayed: 3, gamesToCome: 2, rosterInBin: ['p-1'] },
      },
      { ...base, kind: 'person', id: 'p-1', name: 'Sam Player', seasonId: null, kept: true },
    ];
    const view = binView(items, times);
    expect(view.teams[0]?.facts).toEqual([
      'Games played: 3. Games still to play: 2. They come back with it.',
      'On its roster and in the bin too: Sam Player. The team comes back without them on the league list: bring them back as well, under Removed people.',
    ]);
    expect(view.people.map((p) => p.title)).toEqual(['Sam Player']);
  });

  it('says a game with no round comes back with none, and leaves out other kinds', () => {
    const items: BinListing[] = [
      {
        ...base,
        kind: 'game',
        id: 'g-1',
        name: 'Hawks',
        secondName: 'Owls',
        kept: true,
        details: { startsAt: null, withoutRound: true },
      },
      { ...base, kind: 'court', id: 'c-1', name: 'Court 1', seasonId: null, kept: false },
    ];
    const view = binView(items, times);
    expect(view.games[0]?.title).toBe('Hawks against Owls');
    expect(view.games[0]?.facts).toContain('It has no round now, so it comes back with no round.');
    expect([...view.teams, ...view.people]).toEqual([]);
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
