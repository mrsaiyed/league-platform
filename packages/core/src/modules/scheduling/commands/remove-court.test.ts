import { describe, expect, it } from 'vitest';
import {
  court,
  courtUuid,
  memoryScheduling,
  ownerId,
  venue,
} from '../memory-scheduling.test-helper.ts';
import { removeCourt } from './remove-court.ts';

describe('removeCourt', () => {
  it('moves a court to the bin and keeps its row (A-5)', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1)], courts: [court(1, 1)] });
    expect(await removeCourt(as(ownerId), { courtId: courtUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.courts).toHaveLength(1);
    expect(db.state.courts[0]?.binned).toBe(true);
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.remove_court']);
  });

  it('refuses one already in the bin or missing, and people with no role', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1)],
      courts: [court(1, 1, { binned: true })],
    });
    for (const n of [1, 9]) {
      expect(await removeCourt(as(ownerId), { courtId: courtUuid(n) }, deps)).toMatchObject({
        error: { code: 'court-not-found' },
      });
    }
    expect(await removeCourt(as('someone'), { courtId: courtUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
