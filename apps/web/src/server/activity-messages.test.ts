// The activity log stores a message key per entry (T-226, record 014): core writes
// `activity.<command name>`, and the page turns it into words from the message
// files (T-187). Only the app sees both packages, so the check that every key core
// writes has its words, and every role has a name, lives here.
import { activitySummaryKey, commands, declaredSettings, roles } from '@srleagues/core';
import { en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';

/** Commands that write no activity entry: those that only read, and the few named below. */
const reads = new Set([
  'access.list_access',
  'access.list_activity',
  'access.my_access',
  'leagues.list_divisions',
  'leagues.list_bin',
  'people.get_person',
  'people.list_people',
  'games.list_postponed_games',
  'games.list_my_games',
  // The games list's "Needs a result" and "Earlier games" (step 2.156): reads.
  'games.list_games_needing_result',
  'games.list_earlier_games',
  // Which of a public page's games the person may score (step 2.153): a read.
  'games.list_scoring_offers',
  'leagues.get_season',
  'leagues.preview_season_rules',
  'scheduling.list_venues',
  'scheduling.get_schedule_draft',
  'imports.get_fixture_import',
  'scheduling.preview_schedule_publish',
  'teams.list_roster',
  'games.get_box_score_sheet',
  // Holding a game to score (T-116): the tracker opens, renews every half minute and
  // leaves, which would flood the log. Only taking over a game from someone is logged.
  'games.open_scoring_session',
  'games.renew_scoring_session',
  'games.release_scoring_session',
  // The engine's state for the tracker to load (T-253): a read.
  'games.read_tracker_state',
  // Removing a draft league made by mistake (step 2.150): its entry goes in the
  // platform's own log, since the league and its log are gone (record 063).
  'leagues.remove_draft',
  // The rosters stored on the scorekeeper's device when it opens a game (T-258): a read.
  'games.read_tracker_rosters',
  // Whether the device may offer Reopen, before the tap (step 2.120): a read.
  'games.read_reopen_offer',
]);
// The tracker's taps (step 2.29) are not copied into the activity log: every one is
// already kept as a game event with who sent it, and a game sends hundreds. The players
// its batch adds, changes or takes off at the scorer's table are (record 058), under the
// batch's own command, so `games.apply_tracker_commands` has words.

/** Entries the nightly worker writes itself, not through a registered command (T-51). */
const workerActions = ['leagues.empty_bin'];

describe('activity log messages', () => {
  it('has English words for every command that writes an entry, and no others', () => {
    const writes = [...commands.keys()].filter((name) => !reads.has(name));
    const keys = Object.keys(en).filter((key) => key.startsWith('activity.'));
    const written = [...writes, ...workerActions].map(activitySummaryKey);
    expect(written.filter((key) => !Object.hasOwn(en, key))).toEqual([]);
    expect(keys.filter((key) => !written.includes(key))).toEqual([]);
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
