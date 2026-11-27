// Who gave the parents' confirmation, from the activity log (step 2.146).
import type { ActivityRecord } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { confirmedBy, confirmedBySpan } from './confirmed-by.ts';

const key = 'privacy.childrenInFullConfirmed';
const savedAt = '2026-11-20T18:00:00.000Z';
let n = 0;
const entry = (over: Partial<ActivityRecord> & { at: string }): ActivityRecord => ({
  id: `01900000-0000-7000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
  actorAccountId: 'owner',
  action: 'leagues.set_setting',
  targetType: 'league',
  targetId: null,
  summary: '',
  details: { key, level: 'league', confirmed: true },
  ...over,
});

describe('confirmedBy', () => {
  it('names who saved the confirmation nearest the saved moment', () => {
    const entries = [
      entry({ at: '2026-11-20T17:59:59.000Z', actorAccountId: 'early' }),
      entry({ at: '2026-11-20T18:00:00.000Z', actorAccountId: 'owner' }),
    ];
    expect(confirmedBy(entries, key, savedAt)).toBe('owner');
  });

  it('passes over other settings, unticking and saves far from the moment', () => {
    const entries = [
      entry({ at: savedAt, details: { key: 'privacy.publicNames', confirmed: true } }),
      entry({ at: savedAt, details: { key, level: 'league' } }),
      entry({ at: savedAt, action: 'leagues.clear_setting' }),
      entry({ at: '2026-11-20T18:05:00.000Z' }),
    ];
    expect(confirmedBy(entries, key, savedAt)).toBeUndefined();
  });

  it('says nothing for an entry made by the system', () => {
    expect(confirmedBy([entry({ at: savedAt, actorAccountId: null })], key, savedAt)).toBe(
      undefined,
    );
  });

  it('searches a minute either side', () => {
    expect(confirmedBySpan(savedAt)).toEqual({
      from: '2026-11-20T17:59:00.000Z',
      until: '2026-11-20T18:01:00.000Z',
    });
  });
});
