// Made-up seasons and divisions for the division commands' tests.
import type { DivisionRecord } from './ports.ts';

export const seasonId = '01900000-0000-7000-8000-0000000000c1';
export const otherSeasonId = '01900000-0000-7000-8000-0000000000c2';
export const programAdminId = '01900000-0000-7000-8000-0000000000e1';

export const seasons = [
  { id: seasonId, programId: 'p1', slug: 'one', isCurrent: true },
  { id: otherSeasonId, programId: 'p2', slug: 'one', isCurrent: true },
];

/** An admin limited to program p1 (P4 §4). */
export const programAdminGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: programAdminId,
  role: 'admin',
  scope: { type: 'program', id: 'p1' },
  grantedByAccountId: '01900000-0000-7000-8000-0000000000a1',
  revokedAt: null,
} as const;

export const divisionId = (n: number) =>
  `01900000-0000-7000-8000-0000000d${String(n).padStart(4, '0')}`;

export function division(n: number, fields: Partial<DivisionRecord> = {}): DivisionRecord {
  return {
    id: divisionId(n),
    seasonId,
    parentDivisionId: null,
    name: `Division ${n}`,
    color: null,
    sort: n,
    binned: false,
    version: 1,
    ...fields,
  };
}
