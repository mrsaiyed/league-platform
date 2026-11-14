// The signs that the build has stopped moving (scripts/build-watch-rules.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  limits,
  openOrders,
  span,
  stallSigns,
  watchLines,
  withAges,
} from '../scripts/build-watch-rules.mjs';

const now = '2026-11-14T02:00:00Z';
const ago = (minutes) => new Date(Date.parse(now) - minutes * 60000).toISOString();
const moving = {
  now,
  firstStage: 1,
  ready: [],
  lanes: [{ id: '1.22', openedAt: ago(30) }],
  lockTime: ago(5),
  lastLanding: ago(20),
  oldestOffMain: ago(15),
};
const keys = (facts) => stallSigns(facts).map((sign) => sign.key);

test('a build that is moving shows no sign', () => {
  assert.deepEqual(stallSigns(moving), []);
});

test('the earliest stage waits while later stages hold the lanes', () => {
  const facts = {
    ...moving,
    ready: [{ id: '1.22' }, { id: '1.24' }, { id: '2.50' }],
    lanes: [{ id: '2.42' }, { id: '2.55' }],
  };
  const [sign] = stallSigns(facts);
  assert.equal(sign.key, 'stage-1-waits');
  assert.match(sign.text, /STAGE 1 COMES FIRST: 1\.22, 1\.24 can start/);
  assert.match(sign.text, /2 of the open lanes/);
  assert.match(sign.text, /never skipped/);
});

test('it is no sign when the earliest stage has the lanes, or has nothing that can start', () => {
  assert.deepEqual(keys({ ...moving, ready: [{ id: '1.24' }], lanes: [{ id: '1.22' }] }), []);
  assert.deepEqual(keys({ ...moving, ready: [{ id: '2.50' }], lanes: [{ id: '2.42' }] }), []);
});

test('the earliest stage has steps left that nothing builds and nothing lists', () => {
  const facts = {
    ...moving,
    firstStageLeft: ['1.24', '1.25'],
    ready: [{ id: '2.50' }],
    lanes: [{ id: '2.42' }],
  };
  const [sign] = stallSigns(facts);
  assert.equal(sign.key, 'stage-1-knot');
  assert.match(
    sign.text,
    /STAGE 1 IS NOT DONE AND NOTHING IS BUILDING IT: 1\.24, 1\.25 are unticked/,
  );
  assert.match(sign.text, /complete only when every step in its plan is ticked/);
  assert.match(stallSigns({ ...facts, firstStageLeft: ['1.25'] })[0].text, /1\.25 is unticked/);
  // One of them in a lane is no knot; one able to start is the other sign; none left is none.
  assert.deepEqual(keys({ ...facts, lanes: [{ id: '1.24' }] }), []);
  assert.deepEqual(keys({ ...facts, ready: [{ id: '1.24' }] }), ['stage-1-waits']);
  assert.deepEqual(keys({ ...facts, firstStageLeft: [] }), []);
});

test('a working run that lands nothing for two hours is stuck; an idle build is not', () => {
  const quiet = { ...moving, lastLanding: ago(limits.landingMinutes) };
  assert.deepEqual(keys(quiet), ['nothing-landing']);
  assert.deepEqual(keys({ ...quiet, lastLanding: ago(limits.landingMinutes - 1) }), []);
  // No run is working (the lock is old or gone): the usage allowance ran out. Not a stall.
  assert.deepEqual(keys({ ...quiet, lockTime: ago(limits.lockMinutes) }), []);
  assert.deepEqual(keys({ ...quiet, lockTime: '' }), []);
});

test('a lane open for four hours is named', () => {
  const facts = {
    ...moving,
    lanes: [
      { id: '2.25', openedAt: ago(limits.laneMinutes + 30) },
      { id: '2.42', openedAt: ago(60) },
      { id: '2.55' },
    ],
    firstStage: 2,
  };
  const signs = stallSigns(facts);
  assert.deepEqual(
    signs.map((sign) => sign.key),
    ['lane-2.25'],
  );
  assert.match(signs[0].text, /LANE 2\.25 HAS BEEN OPEN 4\.5 HOURS/);
});

test('main falling two hours behind landed work is a sign', () => {
  assert.deepEqual(keys({ ...moving, oldestOffMain: ago(limits.mainMinutes) }), ['main-behind']);
  assert.deepEqual(keys({ ...moving, oldestOffMain: '' }), []);
});

test('a sign keeps the time it was first seen, and forgets it once it clears', () => {
  const sign = { key: 'main-behind', text: 'x' };
  const first = withAges([sign], {}, ago(90));
  assert.equal(first.signs[0].minutes, 0);
  const second = withAges([sign], first.seen, now);
  assert.equal(second.signs[0].minutes, 90);
  assert.deepEqual(withAges([], second.seen, now), { signs: [], seen: {} });
});

test('orders are the list lines of the overseer file', () => {
  const text = '# Orders\n\n- 2026-11-14T01:50Z — open 1.22 next\n-\nnot a line\n';
  assert.deepEqual(openOrders(text), ['2026-11-14T01:50Z — open 1.22 next']);
  assert.deepEqual(openOrders(''), []);
  assert.deepEqual(openOrders(undefined), []);
});

test('orders are printed before stall signs, and time is said plainly', () => {
  const lines = watchLines(['open 1.22 next'], [{ key: 'k', text: 'STUCK.', minutes: 150 }]);
  assert.equal(lines[0], '>>> ORDER FROM THE OVERSEER: open 1.22 next');
  assert.match(lines[1], /delete its line from \.local\/overseer-orders\.md/);
  assert.equal(lines[2], '>>> STALL (seen for 2.5 hours): STUCK.');
  assert.deepEqual(watchLines([], []), []);
  assert.equal(span(40), '40 minutes');
  assert.equal(span(89), '89 minutes');
  assert.equal(span(90), '1.5 hours');
});
