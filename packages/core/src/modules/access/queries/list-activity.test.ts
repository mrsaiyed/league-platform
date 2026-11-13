import { describe, expect, it } from 'vitest';
import { invite } from '../commands/invite.ts';
import {
  adminId,
  grantOf,
  memoryAccess,
  ownerId,
  strangerId,
} from '../memory-access.test-helper.ts';
import { listActivity } from './list-activity.ts';

describe('listActivity', () => {
  it('shows the owner and admins who changed what, newest first (A-6)', async () => {
    const { deps, as } = memoryAccess();
    await invite(as(ownerId), { email: 'a@example.test', role: 'editor' }, deps);
    await invite(as(adminId), { email: 'b@example.test', role: 'editor' }, deps);
    const result = await listActivity(as(adminId), { limit: 10 }, deps);
    expect(result).toMatchObject({
      ok: true,
      value: [
        { actorAccountId: adminId, action: 'access.invite' },
        { actorAccountId: ownerId, action: 'access.invite' },
      ],
    });
  });

  it('is refused to every other role, and limits a page', async () => {
    const { deps, as } = memoryAccess({ grants: [grantOf(strangerId, 'scheduler')] });
    expect(await listActivity(as(strangerId), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await listActivity(as(ownerId), { limit: 101 }, deps)).toMatchObject({
      error: { code: 'invalid-input' },
    });
  });
});
