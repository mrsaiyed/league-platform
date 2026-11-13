import { describe, expect, it } from 'vitest';
import { memoryScheduling, ownerId, venue, venueUuid } from '../memory-scheduling.test-helper.ts';
import { updateVenue } from './update-venue.ts';

describe('updateVenue', () => {
  it('edits and clears fields, and logs it', async () => {
    const { db, deps, as } = memoryScheduling({
      venues: [venue(1, { address: '1 Court St', mapLink: 'https://m.example.test/x' })],
    });
    const result = await updateVenue(
      as(ownerId),
      { venueId: venueUuid(1), version: 1, name: 'Big gym', address: null, mapLink: null },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.venues[0]).toMatchObject({ name: 'Big gym', address: null, mapLink: null });
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.update_venue']);
  });

  it('changes nothing and logs nothing when nothing differs', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1)] });
    expect(
      await updateVenue(as(ownerId), { venueId: venueUuid(1), version: 1, name: 'Venue 1' }, deps),
    ).toEqual({ ok: true, value: { version: 1 } });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a stale version (T-46), a taken name, a binned or missing venue', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1), venue(2, { name: 'Annex' }), venue(3, { binned: true })],
    });
    const codeOf = async (input: object) => {
      const result = await updateVenue(as(ownerId), input, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf({ venueId: venueUuid(1), version: 3, name: 'X' })).toBe(
      'changed-since-read',
    );
    expect(await codeOf({ venueId: venueUuid(1), version: 1, name: 'annex' })).toBe(
      'venue-name-taken',
    );
    expect(await codeOf({ venueId: venueUuid(3), version: 1, name: 'X' })).toBe('venue-not-found');
    expect(await codeOf({ venueId: venueUuid(9), version: 1, name: 'X' })).toBe('venue-not-found');
  });

  it('needs a change, and refuses people with no role', async () => {
    const { deps, as } = memoryScheduling({ venues: [venue(1)] });
    expect(
      await updateVenue(as(ownerId), { venueId: venueUuid(1), version: 1 }, deps),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(
      await updateVenue(as(null), { venueId: venueUuid(1), version: 1, name: 'X' }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
