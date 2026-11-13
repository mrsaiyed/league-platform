import { describe, expect, it } from 'vitest';
import {
  memoryScheduling,
  ownerId,
  schedulerGrant,
  schedulerId,
  venue,
  venueUuid,
} from '../memory-scheduling.test-helper.ts';
import { restoreVenue } from './restore-venue.ts';

describe('restoreVenue', () => {
  it('brings a venue back from the bin', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1, { binned: true })] });
    expect(await restoreVenue(as(ownerId), { venueId: venueUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.venues[0]?.binned).toBe(false);
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.restore_venue']);
  });

  it('says plainly when another venue took its name, and leaves it in the bin', async () => {
    const { db, deps, as } = memoryScheduling({
      venues: [venue(1, { name: 'Main gym', binned: true }), venue(2, { name: 'main gym' })],
    });
    expect(await restoreVenue(as(ownerId), { venueId: venueUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'venue-name-taken' },
    });
    expect(db.state.venues[0]?.binned).toBe(true);
  });

  it('does nothing for one not in the bin, and refuses a missing one', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1)] });
    expect(await restoreVenue(as(ownerId), { venueId: venueUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.activity).toEqual([]);
    expect(await restoreVenue(as(ownerId), { venueId: venueUuid(9) }, deps)).toMatchObject({
      error: { code: 'venue-not-found' },
    });
  });

  it('is for the owner and admins only: a scheduler may not (record 014)', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1, { binned: true })],
      grants: [schedulerGrant],
    });
    expect(await restoreVenue(as(schedulerId), { venueId: venueUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
