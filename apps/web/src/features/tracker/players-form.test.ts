// What the Players panel does with what is typed (step 2.118, part 2): a line of
// numbers, a clash while typing, a fix that sends only what changed, drafts kept.
import { describe, expect, it } from 'vitest';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';
import {
  cleared,
  clashedIds,
  draftsKey,
  fixChange,
  lineBox,
  lineChanges,
  readDrafts,
  someTeamIsEmpty,
  typed,
  typedClashes,
  writeDrafts,
} from './players-form.ts';

const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const player = (
  n: number,
  jersey: string | null,
  more: Partial<DevicePlayer> = {},
): DevicePlayer => ({
  personId: id(n),
  firstName: `Made${n}`,
  lastName: 'Up',
  jerseyNumber: jersey,
  left: false,
  addedAtGameId: null,
  toReview: false,
  ...more,
});
const rosters: DeviceRosters = {
  home: { teamId: id(90), name: 'Home', players: [player(1, '4'), player(2, '12')] },
  away: { teamId: id(91), name: 'Away', players: [] },
  uniqueJerseys: false,
  allowTies: false,
};

const memoryStore = () => {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
};

describe('the Players panel: what is typed', () => {
  it('adds a bench typed by number in one line, one player each with no name (S-34)', () => {
    expect(lineChanges('away', '3 5 10 12 14', '')).toEqual(
      ['3', '5', '10', '12', '14'].map((jersey) => ({
        type: 'add-player',
        side: 'away',
        jersey,
        name: '',
      })),
    );
    expect(lineChanges('home', ' 23 ', ' Made Player ')).toEqual([
      { type: 'add-player', side: 'home', jersey: '23', name: 'Made Player' },
    ]);
    expect(lineChanges('home', '', 'Only Name')).toEqual([
      { type: 'add-player', side: 'home', jersey: '', name: 'Only Name' },
    ]);
    // Several numbers with a name is one player the contract says no to: worded, not guessed.
    expect(lineChanges('home', '3 5', 'Two')).toHaveLength(1);
  });

  it('marks a number already worn while it is typed, on the line and the wearer (S-44)', () => {
    const clashes = typedClashes(rosters.home, '7 12 4');
    expect(clashes.map((c) => c.jersey)).toEqual(['12', '4']);
    expect([...clashedIds(clashes)].sort()).toEqual([id(1), id(2)].sort());
    expect(typedClashes(rosters.away, '4')).toEqual([]);
  });

  it('sends only what a fix changed, so a league player keeps a name the table may not touch', () => {
    const league = player(1, '4');
    expect(fixChange('home', league, '41', `${league.firstName} ${league.lastName}`)).toEqual({
      type: 'change-player',
      side: 'home',
      playerId: id(1),
      jersey: '41',
    });
    expect(fixChange('home', league, '4', undefined)).toBeNull();
    expect(fixChange('home', league, undefined, 'New Name')).toEqual({
      type: 'change-player',
      side: 'home',
      playerId: id(1),
      name: 'New Name',
    });
    expect(fixChange('home', player(3, '8'), '', undefined)).toMatchObject({ jersey: '' });
  });

  it('opens by itself when a team has nobody on it, a player who left not counted', () => {
    expect(someTeamIsEmpty(rosters)).toBe(true);
    const left = {
      ...rosters,
      away: { ...rosters.away, players: [player(5, '9', { left: true })] },
    };
    expect(someTeamIsEmpty(left)).toBe(true);
    const both = { ...rosters, away: { ...rosters.away, players: [player(5, '9')] } };
    expect(someTeamIsEmpty(both)).toBe(false);
  });

  it('keeps a half-typed line by game through a reload, and clears it once stored', () => {
    const store = memoryStore();
    const drafts = typed({}, lineBox('away'), '3 5 1');
    writeDrafts(store, 'game-1', drafts);
    expect(store.kept.has(draftsKey('game-1'))).toBe(true);
    expect(readDrafts(store, 'game-1')).toEqual({ 'away:number': '3 5 1' });
    expect(readDrafts(store, 'game-2')).toEqual({});
    writeDrafts(store, 'game-1', cleared(drafts, [lineBox('away')]));
    expect(store.kept.size).toBe(0);
    expect(typed(drafts, lineBox('away'), '')).toEqual({});
  });

  it('loses only the typing when the storage cannot be read or written', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    expect(readDrafts(broken, 'g')).toEqual({});
    expect(() => writeDrafts(broken, 'g', { a: 'b' })).not.toThrow();
    const odd = memoryStore();
    odd.setItem(draftsKey('g'), '[1,2]');
    expect(readDrafts(odd, 'g')).toEqual({});
    expect(readDrafts(null, 'g')).toEqual({});
  });
});
