import { describe, expect, it } from 'vitest';
import {
  court,
  memoryScheduling,
  ownerId,
  schedulerGrant,
  schedulerId,
  venue,
} from '../memory-scheduling.test-helper.ts';
import { listVenues } from './list-venues.ts';

describe('listVenues', () => {
  it('lists the venues not in the bin, each with its courts not in the bin', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1), venue(2, { binned: true })],
      courts: [court(1, 1), court(2, 1, { binned: true }), court(3, 2)],
    });
    const result = await listVenues(as(ownerId), {}, deps);
    expect(result.ok && result.value.map((v) => [v.name, v.courts.map((c) => c.name)])).toEqual([
      ['Venue 1', ['Court 1']],
    ]);
  });

  it('lets a scheduler limited to one program read the venues, as league-shared data', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1)],
      grants: [{ ...schedulerGrant, scope: { type: 'program', id: 'p1' } }],
    });
    const result = await listVenues(as(schedulerId), {}, deps);
    expect(result.ok && result.value.map((v) => v.name)).toEqual(['Venue 1']);
  });

  it('works in an archived league, and refuses people with no role', async () => {
    const { db, deps, as } = memoryScheduling({ venues: [venue(1)] });
    db.state.status = 'archived';
    expect(await listVenues(as(ownerId), {}, deps)).toMatchObject({ ok: true });
    expect(await listVenues(as('someone'), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
