import { describe, expect, it } from 'vitest';
import {
  court,
  courtUuid,
  memoryScheduling,
  ownerId,
  venue,
} from '../memory-scheduling.test-helper.ts';
import { updateCourt } from './update-court.ts';

const setUp = () =>
  memoryScheduling({
    venues: [venue(1)],
    courts: [court(1, 1, { name: 'Court A' }), court(2, 1, { name: 'Court B' })],
  });

describe('updateCourt', () => {
  it('renames a court at its version, and logs it', async () => {
    const { db, deps, as } = setUp();
    expect(
      await updateCourt(as(ownerId), { courtId: courtUuid(1), version: 1, name: 'Center' }, deps),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.courts[0]?.name).toBe('Center');
    expect(db.state.activity.map((a) => a.action)).toEqual(['scheduling.update_court']);
  });

  it('moves a court in the order with no version', async () => {
    const { db, deps, as } = setUp();
    expect(await updateCourt(as(ownerId), { courtId: courtUuid(1), sort: 9 }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.courts[0]?.sort).toBe(9);
  });

  it('refuses a rename with no version, a stale one, a taken name and a missing court', async () => {
    const { deps, as } = setUp();
    const codeOf = async (input: object) => {
      const result = await updateCourt(as(ownerId), input, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf({ courtId: courtUuid(1), name: 'X' })).toBe('invalid-input');
    expect(await codeOf({ courtId: courtUuid(1), version: 5, name: 'X' })).toBe(
      'changed-since-read',
    );
    expect(await codeOf({ courtId: courtUuid(1), version: 1, name: 'court b' })).toBe(
      'court-name-taken',
    );
    expect(await codeOf({ courtId: courtUuid(9), sort: 1 })).toBe('court-not-found');
    expect(await codeOf({ courtId: courtUuid(1) })).toBe('invalid-input');
  });

  it('refuses people with no role', async () => {
    const { deps, as } = setUp();
    expect(await updateCourt(as(null), { courtId: courtUuid(1), sort: 1 }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
