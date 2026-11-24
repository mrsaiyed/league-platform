// What the Players panel does with what is typed (step 2.118, part 2): a line of
// numbers, a clash while typing, a fix that sends only what changed, drafts kept.
import { describe, expect, it } from 'vitest';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';
import type { PlayerChange } from './roster-changes.ts';
import type { PlayersResult } from './tracker-controller.ts';
import {
  addLine,
  cleared,
  clashedIds,
  draftsKey,
  fixChange,
  lineBox,
  lineChanges,
  lineProblem,
  readDrafts,
  someTeamIsEmpty,
  typed,
  typedClashes,
  writeDrafts,
  type PlayerDrafts,
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

describe('an add line that is neither a bench nor one player (step 2.118, part 3)', () => {
  it('says several numbers with a name do not go together, and lets the rest through', () => {
    expect(lineProblem('3 5', 'Made Player')).toEqual({ kind: 'numbers-with-name' });
    expect(lineProblem('3,5,10', ' x ')).toEqual({ kind: 'numbers-with-name' });
    expect(lineProblem('3 5 10 12 14', '')).toBeNull();
    expect(lineProblem('12', 'Made Player')).toBeNull();
    expect(lineProblem('', 'Made Player')).toBeNull();
    // A wrong entry is named, so it can be fixed; a number twice is said, not dropped.
    expect(lineProblem('3, 5,,10 abc 12', '')).toEqual({ kind: 'not-a-number', entry: 'abc' });
    expect(lineProblem('1234', '')).toEqual({ kind: 'not-a-number', entry: '1234' });
    expect(lineProblem('1234', 'Made Player')).toEqual({ kind: 'not-a-number', entry: '1234' });
    expect(lineProblem('40 40', '')).toEqual({ kind: 'twice', entry: '40' });
    expect(lineProblem('00 0 7', '')).toBeNull();
  });
});

describe('players form: one submit of an add line at a time (review H2)', () => {
  const ok = { ok: true, commandIds: [], playerIds: [] } as const;
  function harness(answer: () => Promise<PlayersResult>, line = '50 51') {
    let drafts: PlayerDrafts = { [lineBox('away')]: line };
    const stored: (readonly PlayerChange[])[] = [];
    const busy: boolean[] = [];
    const submit = addLine({
      read: () => drafts,
      keep: (next) => {
        drafts = next;
      },
      busy: (_, on) => busy.push(on),
      store: (_, changes) => {
        stored.push(changes);
        return answer();
      },
    });
    return { submit, stored, busy, drafts: () => drafts };
  }

  it('a double tap stores the line once: cleared and busy from the first tap', async () => {
    let answer: (r: PlayersResult) => void = () => undefined;
    const h = harness(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const first = h.submit('away');
    expect(h.drafts()[lineBox('away')]).toBeUndefined();
    expect(h.busy).toEqual([true]);
    expect(await h.submit('away')).toEqual({ kind: 'ignored' });
    answer(ok);
    expect(await first).toEqual({ kind: 'stored', result: ok });
    expect(h.stored).toHaveLength(1);
    expect(h.stored[0]?.map((c) => c.type === 'add-player' && c.jersey)).toEqual(['50', '51']);
    expect(h.busy).toEqual([true, false]);
  });

  it('gives the text back when it could not be stored, and only what was not stored', async () => {
    const refused = harness(() => Promise.resolve({ ok: false, reason: 'not-scoring' }));
    await refused.submit('away');
    expect(refused.drafts()[lineBox('away')]).toBe('50 51');
    const half = harness(() =>
      Promise.resolve({ ok: false, reason: 'storage', code: 'storage-write-failed', stored: 1 }),
    );
    await half.submit('away');
    expect(half.drafts()[lineBox('away')]).toBe('51');
    // A second submit after the first is answered is a change of its own.
    await half.submit('away');
    expect(half.stored).toHaveLength(2);
  });

  it('sends nothing for an empty line or a line with a problem', async () => {
    const h = harness(() => Promise.resolve(ok));
    await h.submit('home');
    const bad = harness(() => Promise.resolve(ok), '40 40');
    expect(await bad.submit('away')).toEqual({
      kind: 'problem',
      problem: { kind: 'twice', entry: '40' },
    });
    expect(h.stored).toHaveLength(0);
    expect(bad.stored).toHaveLength(0);
    expect(bad.drafts()[lineBox('away')]).toBe('40 40');
  });
});
