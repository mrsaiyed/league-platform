import { describe, expect, it } from 'vitest';
import { againCommandId } from './again-command-id.ts';

const kept = '01900000-0000-7000-8000-00e700000001';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('the command ID of a play entered again (S-77, review M1)', () => {
  it('is the same for the same kept play, whatever its letter case', () => {
    expect(againCommandId(kept)).toBe(againCommandId(kept.toUpperCase()));
  });

  it('is a UUID, and differs from the kept play, another kept play, and a play entered again from it', () => {
    const again = againCommandId(kept);
    expect(again).toMatch(uuid);
    expect(again).not.toBe(kept);
    expect(againCommandId('01900000-0000-7000-8000-00e700000002')).not.toBe(again);
    expect(againCommandId(again)).not.toBe(again);
    expect(againCommandId(again)).not.toBe(kept);
  });
});
