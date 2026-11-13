// A command that names no permission, or one that does not exist, is found (T4 §4).
import { describe, expect, it } from 'vitest';
import {
  commandsWithoutRequirement,
  isCommandRequirement,
  nonRoleRequirements,
} from './command-requirements.ts';

// Written by hand from T4 §4, not read from roles.ts, so a permission dropped from
// core by mistake is caught here.
const valid = [
  'league.settings',
  'access.manage',
  'activity.read',
  'season.settings',
  'people.import',
  'schedule.publish',
  'games.score',
  'games.correct',
  'bin.restore',
  'team.lineup',
];

describe('command requirements', () => {
  it('are the permissions and the two non-role needs, and nothing else', () => {
    for (const p of [...valid, ...nonRoleRequirements]) {
      expect(isCommandRequirement(p), p).toBe(true);
    }
    for (const other of [undefined, null, '', 'games', 'games.delete', 'owner', 42]) {
      expect(isCommandRequirement(other), String(other)).toBe(false);
    }
  });

  it('report every command that names nothing, or something unknown', () => {
    const planted = [
      { commandName: 'games.score_ok', permission: 'games.score' },
      { commandName: 'games.nothing' },
      { commandName: 'games.empty', permission: '' },
      { commandName: 'games.typo', permission: 'games.scores' },
      { commandName: 'access.me', permission: 'signed-in' },
    ];
    expect(commandsWithoutRequirement(planted)).toEqual([
      'games.nothing',
      'games.empty',
      'games.typo',
    ]);
  });
});
