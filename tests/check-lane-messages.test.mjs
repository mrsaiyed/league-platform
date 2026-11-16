// The check that a lane's own messages survive its merge with the split messages
// (scripts/lane-messages-rules.mjs, step 2.188): the keys a lane added or changed in the old
// one-object en.ts, found from a made-up base and lane, and each one missing or different
// in the joined messages named.
import assert from 'node:assert/strict';
import test from 'node:test';
import { laneChanges, laneMessageProblems, oldCatalog } from '../scripts/lane-messages-rules.mjs';

const oldFile = (...entries) =>
  [
    '// English interface text (T-187).',
    'export const en = {',
    ...entries,
    '} as const;',
    '',
    'export type MessageKey = keyof typeof en;',
    '',
  ].join('\n');

const base = oldFile(
  "  'home.title': 'Home',",
  '  // A comment, as the old file had.',
  "  'admin.title': 'Admin',",
  "  'tracker.pad.foul':",
  "    'Foul',",
);
// The lane adds two keys (one looked up by a built name), changes one, and removes none.
const lane = oldFile(
  "  'home.title': 'Home',",
  "  'admin.title': 'Admin area',",
  "  'tracker.pad.foul':",
  "    'Foul',",
  "  'adminSettings.area.statistics': 'Statistics',",
  "  'setting.statistics.minimumGamesToRank.label': 'Games a player needs to be ranked',",
);

test("the lane's own added and changed keys, with its texts", () => {
  assert.deepEqual(laneChanges(oldCatalog(base), oldCatalog(lane)), [
    ['admin.title', 'Admin area'],
    ['adminSettings.area.statistics', 'Statistics'],
    ['setting.statistics.minimumGamesToRank.label', 'Games a player needs to be ranked'],
  ]);
});

test('each one missing or different in the joined messages is named; none when all are there', () => {
  const changes = laneChanges(oldCatalog(base), oldCatalog(lane));
  const joined = {
    'home.title': 'Home',
    'admin.title': 'Admin',
    'tracker.pad.foul': 'Foul',
    'setting.statistics.minimumGamesToRank.label': 'Games a player needs to be ranked',
  };
  assert.deepEqual(laneMessageProblems(changes, joined), [
    'different: admin.title: the lane\'s text "Admin area", the joined messages\' "Admin"',
    'missing: adminSettings.area.statistics (the lane\'s text: "Statistics")',
  ]);
  const settled = {
    ...joined,
    'admin.title': 'Admin area',
    'adminSettings.area.statistics': 'Statistics',
  };
  assert.deepEqual(laneMessageProblems(changes, settled), []);
});

test('a file that is already the joined index is refused, not read as no changes', () => {
  const index = [
    "import { enAdmin } from './en/admin.ts';",
    '',
    'export const en = {',
    '  ...enAdmin,',
    '} as const;',
  ].join('\n');
  assert.throws(() => oldCatalog(index, 'HEAD:en.ts'), /HEAD:en\.ts is not the one-object file/);
});
