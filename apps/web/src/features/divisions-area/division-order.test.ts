import { describe, expect, it } from 'vitest';
import { movedOrder, siblingsOf } from './division-order.ts';

const d = (id: string, parentDivisionId: string | null = null) => ({
  id,
  parentDivisionId,
  seasonId: 's',
  name: id,
  color: null,
  sort: 0,
  binned: false,
  version: 1,
});

describe('movedOrder', () => {
  it('swaps a division with the one above or below it', () => {
    const list = [d('a'), d('b'), d('c')];
    expect(movedOrder(list, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(movedOrder(list, 'b', 'down')).toEqual(['a', 'c', 'b']);
  });
  it('changes nothing for the first up, the last down, or one not in the list', () => {
    const list = [d('a'), d('b')];
    expect(movedOrder(list, 'a', 'up')).toBeUndefined();
    expect(movedOrder(list, 'b', 'down')).toBeUndefined();
    expect(movedOrder(list, 'z', 'up')).toBeUndefined();
  });
  it('moves among the divisions under the same parent only', () => {
    const list = [d('a'), d('x', 'a'), d('b'), d('y', 'a')];
    expect(siblingsOf(list, d('y', 'a')).map((s) => s.id)).toEqual(['x', 'y']);
    expect(siblingsOf(list, d('b')).map((s) => s.id)).toEqual(['a', 'b']);
  });
});
