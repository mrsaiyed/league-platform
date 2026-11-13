import { describe, expect, it } from 'vitest';
import {
  court,
  memoryScheduling,
  ownerId,
  venue,
  venueUuid,
} from '../memory-scheduling.test-helper.ts';
import { removeVenue } from './remove-venue.ts';

describe('removeVenue', () => {
  it('moves a venue to the bin and keeps its row (A-5)', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1)] });
    expect(await removeVenue(as(ownerId), { venueId: venueUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.venues).toHaveLength(1);
    expect(db.state.venues[0]?.binned).toBe(true);
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.remove_venue']);
  });

  it('refuses while a court is not in the bin, and allows it once they all are', async () => {
    const { db, deps, as } = memoryScheduling({
      venues: [venue(1)],
      courts: [court(1, 1), court(2, 1, { binned: true })],
    });
    expect(await removeVenue(as(ownerId), { venueId: venueUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'venue-has-courts' },
    });
    expect(db.state.venues[0]?.binned).toBe(false);
    db.state.courts = db.state.courts.map((c) => ({ ...c, binned: true }));
    expect(await removeVenue(as(ownerId), { venueId: venueUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('refuses one already in the bin or missing, and people with no role', async () => {
    const { deps, as } = memoryScheduling({ venues: [venue(1, { binned: true })] });
    for (const n of [1, 9]) {
      expect(await removeVenue(as(ownerId), { venueId: venueUuid(n) }, deps)).toMatchObject({
        error: { code: 'venue-not-found' },
      });
    }
    expect(await removeVenue(as('someone'), { venueId: venueUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
