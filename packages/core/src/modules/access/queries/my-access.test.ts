import { describe, expect, it } from 'vitest';
import { grantOf, memoryAccess, ownerId, programId, strangerId } from '../memory-access.test-helper.ts';
import { permissions } from '../roles.ts';
import { myAccess } from './my-access.ts';

describe('myAccess', () => {
  it('gives the owner every permission', async () => {
    const { deps, as } = memoryAccess();
    expect(await myAccess(as(ownerId), {}, deps)).toEqual({
      ok: true,
      value: { isOwner: true, grants: [], leaguePermissions: [...permissions] },
    });
  });

  it("gives a role its league permissions; a program role's count only in its program", async () => {
    const scorekeeper = grantOf(strangerId, 'scorekeeper');
    const editor = grantOf(strangerId, 'editor', { type: 'program', id: programId });
    const { deps, as } = memoryAccess({ grants: [scorekeeper, editor] });
    expect(await myAccess(as(strangerId), {}, deps)).toEqual({
      ok: true,
      value: {
        isOwner: false,
        grants: [scorekeeper, editor],
        leaguePermissions: ['schedule.read', 'games.score'],
      },
    });
  });

  it('is for signed-in accounts', async () => {
    const { deps, as } = memoryAccess();
    expect(await myAccess(as(null), {}, deps)).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
