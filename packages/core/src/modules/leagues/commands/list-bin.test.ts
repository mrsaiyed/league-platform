import { describe, expect, it } from 'vitest';
import { memoryBin, ownerId, teamId } from '../memory-bin.test-helper.ts';
import { listBin } from './list-bin.ts';

describe('listBin', () => {
  it('lists what is in the bin with the moment each goes for good', async () => {
    const { deps, as } = memoryBin({
      status: 'archived',
      things: [
        { id: teamId(1), kind: 'team', name: 'Hawks', binnedAt: '2026-01-01T00:00:00.000Z' },
        { id: teamId(2), kind: 'team', name: 'Live', binnedAt: null },
      ],
    });
    const result = await listBin(as(ownerId), {}, deps);
    expect(result).toMatchObject({ ok: true, value: { keepDays: 30 } });
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.removedForGoodAt).toBe('2026-01-31T00:00:00.000Z');
  });

  it('is for admins and the owner only', async () => {
    const { deps, as } = memoryBin();
    expect(await listBin(as('someone'), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
