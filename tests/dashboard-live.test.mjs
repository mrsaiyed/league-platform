// The progress page's "who is working this minute", read from made-up helper files in a
// temporary folder laid out the way the Claude app lays out its own.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  liveLimits,
  planStamp,
  readLive,
  roleOf,
  sessionsFolder,
} from '../scripts/dashboard/live.mjs';

const now = Date.parse('2026-11-15T09:00:00Z');
const minutesAgo = (minutes) => new Date(now - minutes * 60000);

function madeUpFolder(helpers) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'srl-live-'));
  const session = 'lead-session';
  const dir = path.join(folder, session, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(folder, `${session}.jsonl`), '{}\n');
  fs.utimesSync(path.join(folder, `${session}.jsonl`), minutesAgo(1), minutesAgo(1));
  for (const helper of helpers) {
    const record = path.join(dir, `agent-${helper.id}.jsonl`);
    fs.writeFileSync(record, helper.brief ?? '{}\n');
    fs.utimesSync(record, minutesAgo(helper.silent), minutesAgo(helper.silent));
    fs.writeFileSync(
      path.join(dir, `agent-${helper.id}.meta.json`),
      JSON.stringify({
        description: helper.what,
        model: helper.model ?? 'opus',
        effort: 'high',
        ...(helper.finished ? { finished: true } : {}),
      }),
    );
  }
  return folder;
}

test('lists who is working this minute, who is quiet and who just finished', () => {
  const folder = madeUpFolder([
    { id: 'aaaa0001', what: 'Build step 2.152 one made-up world', silent: 1 },
    { id: 'aaaa0002', what: 'Independent review: step 2.162', silent: 2, model: 'fable' },
    { id: 'aaaa0003', what: 'Build step 2.150 remove a league', silent: 12 },
    { id: 'aaaa0004', what: 'Area 5 review: step 2.127', silent: 3.5, finished: true },
    { id: 'aaaa0005', what: 'Build step 2.33 the tracker', silent: 30, finished: true },
    { id: 'aaaa0006', what: 'Diagnose 2.39 GitHub failure', silent: 2000 },
  ]);
  try {
    const live = readLive(folder, now);
    assert.equal(live.known, true);
    assert.deepEqual(
      live.helpers.map((h) => [h.step, h.role, h.active, h.finished]),
      [
        ['2.152', 'build', true, false],
        ['2.162', 'review', true, false],
        ['2.150', 'build', false, false],
        ['2.127', 'review', false, true],
      ],
    );
    assert.equal(live.helpers[1].model, 'fable');
    assert.equal(live.lead.active, true);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('finds the step in the brief when the description does not name it', () => {
  const folder = madeUpFolder([
    {
      id: 'bbbb0001',
      what: 'Walk the one world as a person',
      silent: 1,
      brief:
        '{"message":"Your lane is C:\\\\repo\\\\.local\\\\lanes\\\\2.152-one-world and nowhere else"}\n',
    },
  ]);
  try {
    const [helper] = readLive(folder, now).helpers;
    assert.equal(helper.step, '2.152');
    assert.equal(helper.role, 'help');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('says so when the files are not there, and never throws', () => {
  const live = readLive(path.join(os.tmpdir(), 'srl-live-no-such-folder'), now);
  assert.equal(live.known, false);
  assert.deepEqual(live.helpers, []);
  assert.equal(live.lead, null);
  assert.equal(planStamp(path.join(os.tmpdir(), 'srl-live-no-such-folder')), '');
});

test('names the kind of work and the folder the app uses', () => {
  assert.equal(roleOf('Design review: step 2.147 part 1'), 'review');
  assert.equal(roleOf('Design lead: step 2.35 scoring screen'), 'design');
  assert.equal(roleOf('Area audit: going online'), 'audit');
  assert.equal(roleOf('Fix the merge of lane 2.120'), 'build');
  assert.equal(
    path.basename(sessionsFolder('C:\\Some Folder\\my-project', { CLAUDE_CONFIG_DIR: 'x' })),
    path.resolve('C:\\Some Folder\\my-project').replace(/[^A-Za-z0-9]/g, '-'),
  );
  assert.ok(liveLimits.activeSeconds >= 60);
});

test('the plan stamp changes when a plan file is saved again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srl-stamp-'));
  try {
    fs.writeFileSync(path.join(dir, 'STATUS.md'), 'a');
    fs.writeFileSync(path.join(dir, 'STAGE-2.md'), 'a');
    fs.writeFileSync(path.join(dir, 'dashboard.html'), 'not counted');
    const before = planStamp(dir);
    fs.utimesSync(path.join(dir, 'STAGE-2.md'), minutesAgo(-5), minutesAgo(-5));
    assert.notEqual(planStamp(dir), before);
    assert.equal(before.split('-').length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
