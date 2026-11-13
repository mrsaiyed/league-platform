import { describe, expect, it } from 'vitest';
import { invite } from '../commands/invite.ts';
import { grantOf, memoryAccess, ownerId, strangerId } from '../memory-access.test-helper.ts';
import { listAccess } from './list-access.ts';

describe('listAccess', () => {
  it('lists the owner, the grants in force and the open invitations', async () => {
    const { db, deps, as } = memoryAccess();
    await invite(as(ownerId), { email: 'a@example.test', role: 'editor' }, deps);
    db.state.grants.push({ ...grantOf(strangerId, 'editor'), revokedAt: 'yesterday' });
    const result = await listAccess(as(ownerId), {}, deps);
    expect(result).toMatchObject({
      ok: true,
      value: {
        ownerAccountId: ownerId,
        grants: [{ role: 'admin' }],
        invitations: [{ email: 'a@example.test', status: 'pending' }],
      },
    });
  });

  it('is for those who manage access only', async () => {
    const { deps, as } = memoryAccess({ grants: [grantOf(strangerId, 'registrar')] });
    expect(await listAccess(as(strangerId), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
