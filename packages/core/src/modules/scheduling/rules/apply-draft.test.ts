import { describe, expect, it } from 'vitest';
import { applyDraft } from './apply-draft.ts';
import { baseState } from './schedule-test-data.ts';

describe('applyDraft (A-9)', () => {
  it('applies changes in order, leaves the published schedule alone and reports refused changes', () => {
    const published = baseState();
    const result = applyDraft(
      published,
      [
        { kind: 'remove-game', gameId: 'g2' },
        { kind: 'remove-game', gameId: 'g2' },
        { kind: 'rename-round', roundId: 'r1', label: 'Opening week' },
      ],
      [],
    );
    expect(result.state.games.map((g) => g.id)).toEqual(['g1', 'g3']);
    expect(result.state.rounds[0]?.label).toBe('Opening week');
    expect(result.rejected).toEqual([{ index: 1, error: { code: 'unknown-game', gameId: 'g2' } }]);
    expect(published).toEqual(baseState());
  });

  it('reports every clash left in the result', () => {
    const result = applyDraft(baseState(), [], ['2026-10-11']);
    expect(result.clashes).toEqual([{ kind: 'skipped-date', gameId: 'g3', date: '2026-10-11' }]);
  });
});
