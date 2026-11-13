import { describe, expect, it } from 'vitest';
import {
  memoryScheduling,
  ownerId,
  schedulerGrant,
  schedulerId,
  venue,
} from '../memory-scheduling.test-helper.ts';
import { createVenue } from './create-venue.ts';

describe('createVenue', () => {
  it('adds a venue and logs it', async () => {
    const { db, deps, as } = memoryScheduling();
    const result = await createVenue(
      as(ownerId),
      { name: ' Main gym ', address: '1 Court St', mapLink: 'https://maps.example.test/x' },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    expect(db.state.venues[0]).toMatchObject({ name: 'Main gym', address: '1 Court St' });
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.create_venue']);
  });

  it('refuses a name another venue has, but not one in the bin', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1, { name: 'Main gym' }), venue(2, { name: 'Old', binned: true })],
    });
    expect(await createVenue(as(ownerId), { name: 'MAIN GYM' }, deps)).toEqual({
      ok: false,
      error: { code: 'venue-name-taken' },
    });
    expect(await createVenue(as(ownerId), { name: 'old' }, deps)).toMatchObject({ ok: true });
  });

  it('refuses a map link that is not https, and an empty name', async () => {
    const { deps, as } = memoryScheduling();
    for (const input of [
      { name: 'A', mapLink: 'http://maps.example.test' },
      { name: 'A', mapLink: 'javascript:alert(1)' },
      { name: '  ' },
    ]) {
      expect(await createVenue(as(ownerId), input, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it('lets a scheduler in, and refuses others and an archived league (U-9)', async () => {
    const { db, deps, as } = memoryScheduling({ grants: [schedulerGrant] });
    expect(await createVenue(as(schedulerId), { name: 'A' }, deps)).toMatchObject({ ok: true });
    expect(await createVenue(as('someone'), { name: 'B' }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    db.state.status = 'archived';
    expect(await createVenue(as(ownerId), { name: 'C' }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
