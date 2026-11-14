// The activity log stores a message key per entry (T-226, record 014): core writes
// `activity.<command name>`, and the page turns it into words from the message
// files (T-187). Only the app sees both packages, so the check that every key core
// writes has its words, and every role has a name, lives here.
import { activitySummaryKey, commands, declaredSettings, roles } from '@srleagues/core';
import { en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';

/** Commands that only read, so write no activity entry. */
const reads = new Set([
  'access.list_access',
  'access.list_activity',
  'access.my_access',
  'leagues.list_divisions',
  'people.list_people',
  'games.list_postponed_games',
  'games.list_my_games',
  'leagues.get_season',
  'leagues.preview_season_rules',
  'scheduling.list_venues',
  'scheduling.get_schedule_draft',
  'imports.get_fixture_import',
  'scheduling.preview_schedule_publish',
  'teams.list_roster',
]);

describe('activity log messages', () => {
  it('has English words for every command that writes an entry, and no others', () => {
    const writes = [...commands.keys()].filter((name) => !reads.has(name));
    const keys = Object.keys(en).filter((key) => key.startsWith('activity.'));
    expect(writes.map(activitySummaryKey).filter((key) => !Object.hasOwn(en, key))).toEqual([]);
    expect(keys.filter((key) => !writes.map(activitySummaryKey).includes(key))).toEqual([]);
  });

  it('has words for the label of every declared setting (T-98, T-187)', () => {
    for (const setting of declaredSettings.all()) {
      expect(Object.hasOwn(en, setting.label), setting.label).toBe(true);
    }
  });

  it('has plain words for refusing a duplicate jersey number (step 2.19)', () => {
    for (const command of ['add_to_roster', 'change_roster_entry'] as const) {
      expect(en[`error.teams.${command}.jersey-taken`]).toMatch(/already wears that number/);
    }
  });

  it('names every role, and the owner', () => {
    for (const role of ['owner', ...roles]) expect(Object.hasOwn(en, `role.${role}`)).toBe(true);
  });
});
