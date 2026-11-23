import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  grantOf,
  memoryBin,
  otherSeasonId,
  ownerId,
  seasonId,
  teamId,
} from '../memory-bin.test-helper.ts';
import { listBinPart } from './list-bin-part.ts';

const binnedAt = '2026-01-01T00:00:00.000Z';
const things = [
  { id: teamId(1), kind: 'team' as const, name: 'Hawks', binnedAt, season: seasonId },
  { id: teamId(2), kind: 'game' as const, name: 'A v B', binnedAt, season: seasonId },
  { id: teamId(3), kind: 'game' as const, name: 'C v D', binnedAt, season: otherSeasonId },
  { id: teamId(4), kind: 'person' as const, name: 'Ada Lovell', binnedAt },
  { id: teamId(5), kind: 'venue' as const, name: 'North Gym', binnedAt },
  { id: teamId(6), kind: 'division' as const, name: 'Under 12', binnedAt, season: seasonId },
];
const inProgram = (accountId: string, role: Grant['role'], program: string): Grant => ({
  ...grantOf(accountId, role),
  scope: { type: 'program', id: program },
});
const names = async (grants: Grant[], who: string) => {
  const { deps, as } = memoryBin({ things, grants });
  const result = await listBinPart(as(who), {}, deps);
  if (!result.ok) throw new Error('refused');
  return { kinds: result.value.kinds, names: result.value.items.map((i) => i.name) };
};

describe('listBinPart', () => {
  it('gives the owner the whole bin, with every kind', async () => {
    const part = await names([], ownerId);
    expect(part.names).toEqual(things.map((t) => t.name));
    expect(part.kinds).toEqual(['team', 'division', 'game', 'person', 'venue', 'court']);
  });

  it('gives a scheduler the games and venues, not the teams or people', async () => {
    const part = await names([grantOf('s', 'scheduler')], 's');
    expect(part.names).toEqual(['A v B', 'C v D', 'North Gym']);
    expect(part.kinds).toEqual(['game', 'venue', 'court']);
  });

  it('gives a registrar what removing people lets them restore: the people only', async () => {
    expect(await names([grantOf('r', 'registrar')], 'r')).toEqual({
      kinds: ['person'],
      names: ['Ada Lovell'],
    });
  });

  it("gives a club's admin nothing: their teams are restored at the program", async () => {
    const clubAdmin: Grant = { ...grantOf('c', 'club_admin'), scope: { type: 'club', id: 'c1' } };
    expect(await names([clubAdmin], 'c')).toEqual({ kinds: [], names: [] });
  });

  it("gives a program's admin only that program's things, nothing league-wide", async () => {
    const part = await names([inProgram('p', 'admin', 'p2')], 'p');
    expect(part.names).toEqual(['C v D']);
    expect(part.kinds).toEqual(['team', 'division', 'game']);
  });

  it('gives a program scheduler their program games only', async () => {
    const part = await names([inProgram('q', 'scheduler', 'p1')], 'q');
    expect(part.names).toEqual(['A v B']);
  });

  it('lists nothing, and no kind, to someone who may restore nothing', async () => {
    expect(await names([grantOf('k', 'scorekeeper')], 'k')).toEqual({ kinds: [], names: [] });
  });

  it('refuses a visitor', async () => {
    const { deps, as } = memoryBin({ things });
    expect(await listBinPart({ ...as(ownerId), accountId: null }, {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
