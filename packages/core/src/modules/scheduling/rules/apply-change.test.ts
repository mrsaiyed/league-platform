import { describe, expect, it } from 'vitest';
import { applyDraftChange, maxRounds } from './apply-change.ts';
import { baseState, game } from './schedule-test-data.ts';
import type { ScheduleState } from './schedule-types.ts';

function ok(result: ReturnType<typeof applyDraftChange>): {
  state: ScheduleState;
  clashes: unknown[];
} {
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result;
}

describe('applyDraftChange (P7 §4.3)', () => {
  it('adds a game and flags the clash it causes at once', () => {
    const s = baseState();
    const added = ok(
      applyDraftChange(
        s,
        {
          kind: 'add-game',
          game: game('g9', { homeTeamId: 'a', awayTeamId: 'e', court: 'Court 3' }),
        },
        [],
      ),
    );
    expect(added.state.games).toHaveLength(4);
    expect(added.clashes).toEqual([
      {
        kind: 'team-in-two-places',
        teamId: 'a',
        date: '2026-10-04',
        time: '18:00',
        gameIds: ['g1', 'g9'],
      },
    ]);
    expect(s.games).toHaveLength(3);
  });

  it('refuses an added game that exists, plays itself or uses an unknown round', () => {
    const s = baseState();
    const code = (g: ReturnType<typeof game>): string | undefined => {
      const r = applyDraftChange(s, { kind: 'add-game', game: g }, []);
      return r.ok ? undefined : r.error.code;
    };
    expect(code(game('g1'))).toBe('game-exists');
    expect(code(game('g9', { awayTeamId: 'a' }))).toBe('team-plays-itself');
    expect(code(game('g9', { roundId: 'nope' }))).toBe('unknown-round');
  });

  it('moves a game and flags a skipped date', () => {
    const moved = ok(
      applyDraftChange(
        baseState(),
        {
          kind: 'move-game',
          gameId: 'g1',
          to: { roundId: 'r2', date: '2026-10-12', time: '18:00', venueId: 'v1', court: 'Court 1' },
        },
        ['2026-10-12'],
      ),
    );
    expect(moved.state.games.find((g) => g.id === 'g1')?.date).toBe('2026-10-12');
    expect(moved.clashes).toEqual([{ kind: 'skipped-date', gameId: 'g1', date: '2026-10-12' }]);
  });

  it('refuses to move an unknown game', () => {
    const r = applyDraftChange(
      baseState(),
      {
        kind: 'move-game',
        gameId: 'zz',
        to: { roundId: null, date: '2026-10-04', time: null, venueId: null, court: null },
      },
      [],
    );
    expect(r).toEqual({ ok: false, error: { code: 'unknown-game', gameId: 'zz' } });
  });

  it('swaps two games slots, keeping their teams', () => {
    const swapped = ok(
      applyDraftChange(baseState(), { kind: 'swap-games', gameId: 'g1', otherGameId: 'g3' }, []),
    );
    const g1 = swapped.state.games.find((g) => g.id === 'g1');
    const g3 = swapped.state.games.find((g) => g.id === 'g3');
    expect([g1?.roundId, g1?.date, g1?.homeTeamId]).toEqual(['r2', '2026-10-11', 'a']);
    expect([g3?.roundId, g3?.date, g3?.awayTeamId]).toEqual(['r1', '2026-10-04', 'c']);
  });

  it('flags the clash a swap causes and refuses a swap with itself', () => {
    const base = baseState();
    const s: ScheduleState = {
      ...base,
      games: [
        ...base.games,
        game('g4', { homeTeamId: 'a', awayTeamId: 'e', time: '19:00', court: 'Court 2' }),
      ],
    };
    const swapped = ok(
      applyDraftChange(s, { kind: 'swap-games', gameId: 'g2', otherGameId: 'g3' }, []),
    );
    expect(swapped.clashes).toEqual([
      {
        kind: 'team-in-two-places',
        teamId: 'a',
        date: '2026-10-04',
        time: '19:00',
        gameIds: ['g3', 'g4'],
      },
    ]);
    const self = applyDraftChange(
      baseState(),
      { kind: 'swap-games', gameId: 'g1', otherGameId: 'g1' },
      [],
    );
    expect(self).toEqual({ ok: false, error: { code: 'swap-with-itself', gameId: 'g1' } });
  });

  it('removes a game and refuses an unknown one', () => {
    const removed = ok(applyDraftChange(baseState(), { kind: 'remove-game', gameId: 'g2' }, []));
    expect(removed.state.games.map((g) => g.id)).toEqual(['g1', 'g3']);
    const r = applyDraftChange(baseState(), { kind: 'remove-game', gameId: 'zz' }, []);
    expect(r.ok).toBe(false);
  });

  it('sets how a game is recorded and refuses an unknown game', () => {
    const r = ok(
      applyDraftChange(
        baseState(),
        { kind: 'set-recording', gameId: 'g2', recording: 'box-score' },
        [],
      ),
    );
    expect(r.state.games.find((g) => g.id === 'g2')).toMatchObject({ recording: 'box-score' });
    expect(r.clashes).toEqual([]);
    const refused = applyDraftChange(
      baseState(),
      { kind: 'set-recording', gameId: 'zz', recording: 'live' },
      [],
    );
    expect(refused).toEqual({ ok: false, error: { code: 'unknown-game', gameId: 'zz' } });
  });

  it('renames a round, trimming the label, and refuses an empty one', () => {
    const renamed = ok(
      applyDraftChange(
        baseState(),
        { kind: 'rename-round', roundId: 'r2', label: '  Week 5 - Rivalry Week ' },
        [],
      ),
    );
    expect(renamed.state.rounds[1]?.label).toBe('Week 5 - Rivalry Week');
    const empty = applyDraftChange(
      baseState(),
      { kind: 'rename-round', roundId: 'r2', label: ' ' },
      [],
    );
    expect(empty).toEqual({ ok: false, error: { code: 'empty-round-label', roundId: 'r2' } });
    const unknown = applyDraftChange(
      baseState(),
      { kind: 'rename-round', roundId: 'zz', label: 'x' },
      [],
    );
    expect(unknown.ok).toBe(false);
  });

  it('changes a round date, moving its games and flagging a skipped date', () => {
    const changed = ok(
      applyDraftChange(
        baseState(),
        { kind: 'change-round-date', roundId: 'r1', date: '2026-10-18' },
        ['2026-10-18'],
      ),
    );
    expect(changed.state.rounds[0]?.date).toBe('2026-10-18');
    expect(changed.state.games.filter((g) => g.date === '2026-10-18').map((g) => g.id)).toEqual([
      'g1',
      'g2',
    ]);
    expect(changed.clashes).toHaveLength(2);
    const unknown = applyDraftChange(
      baseState(),
      { kind: 'change-round-date', roundId: 'zz', date: '2026-10-18' },
      [],
    );
    expect(unknown.ok).toBe(false);
  });

  const toSlot = { roundId: null, date: '2026-10-04', time: null, venueId: null, court: null };

  it('moves nothing in a round with no date, and leaves games on another date alone', () => {
    const base = baseState();
    const noDate: ScheduleState = {
      rounds: base.rounds.map((r) => (r.id === 'r1' ? { ...r, date: null } : r)),
      games: base.games,
    };
    const a = ok(
      applyDraftChange(
        noDate,
        { kind: 'change-round-date', roundId: 'r1', date: '2026-10-18' },
        [],
      ),
    );
    expect(a.state.rounds[0]?.date).toBe('2026-10-18');
    expect(a.state.games).toEqual(base.games);

    const other: ScheduleState = {
      rounds: base.rounds,
      games: [...base.games, game('g5', { date: '2026-10-06', homeTeamId: 'e', awayTeamId: 'f' })],
    };
    const b = ok(
      applyDraftChange(other, { kind: 'change-round-date', roundId: 'r1', date: '2026-10-18' }, []),
    );
    expect(b.state.games.find((g) => g.id === 'g5')?.date).toBe('2026-10-06');
  });

  it('refuses an unknown round when moving a game', () => {
    const r = applyDraftChange(
      baseState(),
      { kind: 'move-game', gameId: 'g1', to: { ...toSlot, roundId: 'nope' } },
      [],
    );
    expect(r).toEqual({ ok: false, error: { code: 'unknown-round', roundId: 'nope' } });
  });

  it('refuses a swap with an unknown second game', () => {
    const r = applyDraftChange(
      baseState(),
      { kind: 'swap-games', gameId: 'g1', otherGameId: 'zz' },
      [],
    );
    expect(r).toEqual({ ok: false, error: { code: 'unknown-game', gameId: 'zz' } });
  });

  it('refuses dates that are not real calendar dates and times that are not HH:MM', () => {
    const code = (change: Parameters<typeof applyDraftChange>[1]): unknown => {
      const r = applyDraftChange(baseState(), change, []);
      return r.ok ? 'ok' : r.error;
    };
    const bad = ['2026-02-30', '2026-13-01', '10/04/2026', '2026-1-4', ''];
    for (const date of bad) {
      expect(code({ kind: 'add-game', game: game('g9', { homeTeamId: 'x', date }) })).toEqual({
        code: 'invalid-date',
        value: date,
      });
      expect(code({ kind: 'move-game', gameId: 'g1', to: { ...toSlot, date } })).toEqual({
        code: 'invalid-date',
        value: date,
      });
      expect(code({ kind: 'change-round-date', roundId: 'r1', date })).toEqual({
        code: 'invalid-date',
        value: date,
      });
    }
    for (const time of ['24:00', '9:00', '18:60', '6pm']) {
      expect(code({ kind: 'add-game', game: game('g9', { homeTeamId: 'x', time }) })).toEqual({
        code: 'invalid-time',
        value: time,
      });
      expect(code({ kind: 'move-game', gameId: 'g1', to: { ...toSlot, time } })).toEqual({
        code: 'invalid-time',
        value: time,
      });
    }
    expect(code({ kind: 'move-game', gameId: 'g1', to: { ...toSlot, time: '00:00' } })).toBe('ok');
    expect(code({ kind: 'change-round-date', roundId: 'r1', date: '2028-02-29' })).toBe('ok');
  });
});

describe('adding and removing a round (step 2.160)', () => {
  const refusal = (s: ScheduleState, change: Parameters<typeof applyDraftChange>[1]) => {
    const result = applyDraftChange(s, change, []);
    return result.ok ? 'ok' : result.error;
  };

  it('adds a round after the others, its name trimmed, without touching a game', () => {
    const s = baseState();
    const added = ok(
      applyDraftChange(
        s,
        { kind: 'add-round', round: { id: 'r3', label: '  Week 3 ', date: '2026-10-18' } },
        [],
      ),
    );
    expect(added.state.rounds.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(added.state.rounds[2]).toEqual({
      id: 'r3',
      number: 3,
      label: 'Week 3',
      date: '2026-10-18',
    });
    expect(added.state.games).toEqual(s.games);
    expect(s.rounds).toHaveLength(2);
  });

  it('adds a round to a season that has none, and a game can then be put in it', () => {
    const empty: ScheduleState = { rounds: [], games: [] };
    const first = ok(
      applyDraftChange(
        empty,
        { kind: 'add-round', round: { id: 'r1', label: 'Week 1', date: '2026-10-04' } },
        [],
      ),
    );
    const withGame = ok(applyDraftChange(first.state, { kind: 'add-game', game: game('g1') }, []));
    expect(withGame.state.games.map((g) => g.roundId)).toEqual(['r1']);
  });

  it('refuses a round whose id is taken, with no name, or with a date that is not one', () => {
    const s = baseState();
    expect(
      refusal(s, { kind: 'add-round', round: { id: 'r1', label: 'Again', date: '2026-10-18' } }),
    ).toEqual({ code: 'round-exists', roundId: 'r1' });
    expect(
      refusal(s, { kind: 'add-round', round: { id: 'r3', label: '   ', date: '2026-10-18' } }),
    ).toEqual({ code: 'empty-round-label', roundId: 'r3' });
    expect(
      refusal(s, { kind: 'add-round', round: { id: 'r3', label: 'Week 3', date: '2026-02-30' } }),
    ).toEqual({ code: 'invalid-date', value: '2026-02-30' });
    expect(
      refusal(s, { kind: 'add-round', round: { id: 'r3', label: 'Week 3', date: null } }),
    ).toBe('ok');
  });

  it('refuses a round past the most a season holds', () => {
    const full: ScheduleState = {
      rounds: Array.from({ length: maxRounds }, (_, i) => ({
        id: `r${i}`,
        number: i + 1,
        label: `Round ${i}`,
        date: null,
      })),
      games: [],
    };
    expect(
      refusal(full, { kind: 'add-round', round: { id: 'new', label: 'One more', date: null } }),
    ).toEqual({ code: 'too-many-rounds', roundId: 'new' });
  });

  it('gives a new round back a number an earlier publication freed (a known choice)', () => {
    // Rounds 1 and 2 are left; round 3 was removed and that removal published, so no record
    // of it is left: the new round is 3, and an old public link `?round=3` opens it.
    const s: ScheduleState = {
      rounds: [
        { id: 'r1', number: 1, label: 'Week 1', date: null },
        { id: 'r2', number: 2, label: 'Week 2', date: null },
      ],
      games: [],
    };
    const added = ok(
      applyDraftChange(s, { kind: 'add-round', round: { id: 'n3', label: 'New', date: null } }, []),
    ).state;
    expect(added.rounds.at(-1)).toMatchObject({ id: 'n3', number: 3 });
  });

  it('numbers a round after every number its rounds hold, ones the draft removed too', () => {
    // Two rounds, the second numbered 1000 (an earlier round was removed long ago).
    const s: ScheduleState = {
      rounds: [
        { id: 'r1', number: 1, label: 'Week 1', date: null },
        { id: 'r9', number: 999, label: 'Late', date: null },
      ],
      games: [],
    };
    const added = ok(
      applyDraftChange(s, { kind: 'add-round', round: { id: 'n1', label: 'A', date: null } }, []),
    ).state;
    expect(added.rounds.at(-1)?.number).toBe(1000);
    // Removing the last does not free its number until publishing has removed it.
    const removed = ok(applyDraftChange(added, { kind: 'remove-round', roundId: 'n1' }, [])).state;
    expect(
      refusal(removed, { kind: 'add-round', round: { id: 'n2', label: 'B', date: null } }),
    ).toEqual({ code: 'too-many-rounds', roundId: 'n2' });
    // Nor its id: a removed round cannot be added again under the same id.
    const fewer = ok(applyDraftChange(s, { kind: 'remove-round', roundId: 'r1' }, [])).state;
    expect(
      refusal(fewer, { kind: 'add-round', round: { id: 'r1', label: 'Again', date: null } }),
    ).toEqual({ code: 'round-exists', roundId: 'r1' });
  });

  it('refuses a round date the database would not take, added or changed', () => {
    const s = baseState();
    for (const date of ['1899-12-31', '3000-01-01']) {
      expect(refusal(s, { kind: 'add-round', round: { id: 'r3', label: 'Week 3', date } })).toEqual(
        { code: 'date-out-of-range', value: date },
      );
      expect(refusal(s, { kind: 'change-round-date', roundId: 'r1', date })).toEqual({
        code: 'date-out-of-range',
        value: date,
      });
    }
    expect(refusal(s, { kind: 'change-round-date', roundId: 'r1', date: '2999-12-31' })).toBe('ok');
  });

  it('removes a round with no games and refuses one with games or that is not there', () => {
    const s = ok(
      applyDraftChange(
        baseState(),
        { kind: 'add-round', round: { id: 'r3', label: 'Week 3', date: '2026-10-18' } },
        [],
      ),
    ).state;
    const removed = ok(applyDraftChange(s, { kind: 'remove-round', roundId: 'r3' }, []));
    expect(removed.state.rounds.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(refusal(s, { kind: 'remove-round', roundId: 'r2' })).toEqual({
      code: 'round-has-games',
      roundId: 'r2',
    });
    expect(refusal(s, { kind: 'remove-round', roundId: 'r9' })).toEqual({
      code: 'unknown-round',
      roundId: 'r9',
    });
    // Once its one game has moved out, Week 2 can go; a game cannot then be put in it.
    const moved = ok(
      applyDraftChange(
        s,
        { kind: 'move-game', gameId: 'g3', to: { ...game('g3'), roundId: 'r3' } },
        [],
      ),
    ).state;
    const gone = ok(applyDraftChange(moved, { kind: 'remove-round', roundId: 'r2' }, [])).state;
    expect(
      refusal(gone, { kind: 'move-game', gameId: 'g3', to: { ...game('g3'), roundId: 'r2' } }),
    ).toEqual({ code: 'unknown-round', roundId: 'r2' });
  });
});
