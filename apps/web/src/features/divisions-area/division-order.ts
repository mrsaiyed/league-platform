// The order of a division's siblings after moving it one place up or down (P7 §1): the ids
// of every division under the same parent (or at the top), in the new order. Moving the
// first up or the last down changes nothing (undefined), so the screen draws no such button.
import type { DivisionRecord } from '@srleagues/core';

export type Direction = 'up' | 'down';

/** The division's siblings, itself among them, in order. */
export function siblingsOf(
  divisions: readonly DivisionRecord[],
  division: Pick<DivisionRecord, 'parentDivisionId'>,
): readonly DivisionRecord[] {
  return divisions.filter((d) => d.parentDivisionId === division.parentDivisionId);
}

export function movedOrder(
  siblings: readonly Pick<DivisionRecord, 'id'>[],
  divisionId: string,
  direction: Direction,
): readonly string[] | undefined {
  const ids = siblings.map((d) => d.id);
  const at = ids.indexOf(divisionId);
  const to = direction === 'up' ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= ids.length) return undefined;
  const next = [...ids];
  next.splice(at, 1);
  next.splice(to, 0, divisionId);
  return next;
}
