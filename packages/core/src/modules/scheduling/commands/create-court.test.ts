import { describe, expect, it } from 'vitest';
import {
  court,
  memoryScheduling,
  ownerId,
  venue,
  venueUuid,
} from '../memory-scheduling.test-helper.ts';
import { createCourt } from './create-court.ts';

describe('createCourt', () => {
  it('adds a court last in its venue, and logs it', async () => {
    const { db, deps, as } = memoryScheduling({
      venues: [venue(1)],
      courts: [court(1, 1, { sort: 4 })],
    });
    expect(
      await createCourt(as(ownerId), { venueId: venueUuid(1), name: ' Court B ' }, deps),
    ).toMatchObject({ ok: true });
    expect(db.state.courts[1]).toMatchObject({ name: 'Court B', sort: 5 });
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.create_court']);
  });

  it("refuses a name the venue's other court has, but the same name at another venue is fine", async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1), venue(2)],
      courts: [court(1, 1, { name: 'Court A' })],
    });
    expect(
      await createCourt(as(ownerId), { venueId: venueUuid(1), name: 'court a' }, deps),
    ).toEqual({ ok: false, error: { code: 'court-name-taken' } });
    expect(
      await createCourt(as(ownerId), { venueId: venueUuid(2), name: 'Court A' }, deps),
    ).toMatchObject({ ok: true });
  });

  it('refuses a venue that is in the bin or missing, and people with no role', async () => {
    const { deps, as } = memoryScheduling({ venues: [venue(1, { binned: true })] });
    for (const n of [1, 9]) {
      expect(
        await createCourt(as(ownerId), { venueId: venueUuid(n), name: 'A' }, deps),
      ).toMatchObject({ error: { code: 'venue-not-found' } });
    }
    expect(
      await createCourt(as('someone'), { venueId: venueUuid(1), name: 'A' }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
