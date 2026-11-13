import { describe, expect, it } from 'vitest';
import {
  court,
  courtUuid,
  memoryScheduling,
  ownerId,
  venue,
} from '../memory-scheduling.test-helper.ts';
import { restoreCourt } from './restore-court.ts';

describe('restoreCourt', () => {
  it('brings a court back from the bin', async () => {
    const { db, deps, as } = memoryScheduling({
      venues: [venue(1)],
      courts: [court(1, 1, { binned: true })],
    });
    expect(await restoreCourt(as(ownerId), { courtId: courtUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.courts[0]?.binned).toBe(false);
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.restore_court']);
  });

  it('keeps it in the bin while its venue is there', async () => {
    const { db, deps, as } = memoryScheduling({
      venues: [venue(1, { binned: true })],
      courts: [court(1, 1, { binned: true })],
    });
    expect(await restoreCourt(as(ownerId), { courtId: courtUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'court-venue-in-bin' },
    });
    expect(db.state.courts[0]?.binned).toBe(true);
  });

  it('says plainly when another court of the venue took its name', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1)],
      courts: [court(1, 1, { name: 'Court A', binned: true }), court(2, 1, { name: 'court a' })],
    });
    expect(await restoreCourt(as(ownerId), { courtId: courtUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'court-name-taken' },
    });
  });

  it('does nothing for one not in the bin, and refuses a missing one and people with no role', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1)], courts: [court(1, 1)] });
    expect(await restoreCourt(as(ownerId), { courtId: courtUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.activity).toEqual([]);
    expect(await restoreCourt(as(ownerId), { courtId: courtUuid(9) }, deps)).toMatchObject({
      error: { code: 'court-not-found' },
    });
    expect(await restoreCourt(as('someone'), { courtId: courtUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
