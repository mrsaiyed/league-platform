import { describe, expect, it } from 'vitest';
import { applyDraftChange } from './apply-change.ts';
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
    const s = baseState();
    s.games.push(game('g4', { homeTeamId: 'a', awayTeamId: 'e', time: '19:00', court: 'Court 2' }));
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
});
