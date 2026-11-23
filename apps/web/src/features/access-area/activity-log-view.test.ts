import type { ActivityRecord } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { dayAfter, logAskedOf, logLineOf, logQueryOf } from './activity-log-view.ts';

const id = '01900000-0000-7000-8000-000000000001';
const team = '01900000-0000-7000-8000-0000000000a1';
const record = (more: Partial<ActivityRecord>): ActivityRecord => ({
  id,
  at: '2026-11-20T18:00:00.000Z',
  actorAccountId: id,
  action: 'teams.remove_team',
  targetType: 'team',
  targetId: team,
  summary: 'activity.teams.remove_team',
  details: {},
  ...more,
});

describe('the activity log screen (step 2.77)', () => {
  it('keeps only well-formed choices from the address, and gives them back', () => {
    const asked = logAskedOf({
      who: id.toUpperCase(),
      kind: 'teams',
      from: '2026-11-01',
      to: 'yesterday',
      before: `2026-11-20T18:00:00.000Z|${id}`,
      after: `2026-11-20T18:00:00.000Z|${id}`,
    });
    expect(asked).toEqual({
      who: id,
      kind: 'teams',
      from: '2026-11-01',
      before: { at: '2026-11-20T18:00:00.000Z', id },
    });
    expect(logAskedOf({ kind: 'everything', who: 'x' })).toEqual({});
    expect(logQueryOf(asked, { after: { at: 'A', id: 'B' } })).toEqual({
      who: id,
      kind: 'teams',
      from: '2026-11-01',
      after: 'A|B',
    });
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
  });

  it('leads a removal to the bin only while the thing is still there', () => {
    expect(logLineOf(record({}), new Set([team])).inBin).toBe(team);
    expect(logLineOf(record({}), new Set()).inBin).toBeUndefined();
    const restored = record({ action: 'leagues.restore_team' });
    expect(logLineOf(restored, new Set([team])).inBin).toBeUndefined();
  });

  it("says a season's status, and the reason given", () => {
    const season = record({
      action: 'leagues.update_season',
      details: { changed: 'status', status: 'draft' },
    });
    expect(logLineOf(season, new Set())).toMatchObject({ seasonStatus: 'draft' });
    const back = record({
      action: 'games.put_game_back',
      details: { reason: 'Gym reopened', was: 'cancelled', now: 'scheduled', note: null },
    });
    expect(logLineOf(back, new Set())).toMatchObject({
      reason: 'Gym reopened',
      values: { reason: 'Gym reopened', was: 'cancelled', now: 'scheduled' },
    });
  });
});
