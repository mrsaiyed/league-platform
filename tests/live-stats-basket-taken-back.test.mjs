// A basket taken back after other plays (step 2.247, T-432, S-120): `unscore` names the
// basket by its own play ID, and the basket then reads as never made.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  derive,
  describePlay,
  HALVES,
  hasRecordedStats,
  newGame,
  QUARTERS,
  runningScores,
  scoreByPeriod,
  TrackerError,
} from '../packages/sports/src/basketball/live.ts';

let n = 0;
const play = (state, command, id = `c${++n}`) => apply(state, command, { id, now: 1000 + n });
const lineups = [
  { type: 'lineup', side: 'home', playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  { type: 'lineup', side: 'away', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
];
const started = (rules = QUARTERS) => lineups.reduce((s, c) => play(s, c), newGame(rules));
const basket = (playerId, points, side = 'home') => ({
  type: 'score',
  side,
  playerId,
  points,
});
const unscore = (playId, playerId, points, side = 'home') => ({
  type: 'unscore',
  side,
  playerId,
  points,
  playId,
});
const refused = (state, command, words) =>
  assert.throws(
    () => play(state, command),
    (e) => e instanceof TrackerError && e.message === words,
  );

describe('taking back an earlier basket', () => {
  it('refuses a play that is not in the game, not a basket, already taken back or not matching', () => {
    let s = play(started(), basket('h1', 2), 'b1');
    s = play(s, { type: 'foul', side: 'home', playerId: 'h1' }, 'f1');
    refused(s, unscore('nope', 'h1', 2), 'That basket is not in this game.');
    refused(s, unscore('', 'h1', 2), 'Pick the basket to take back.');
    refused(s, unscore('f1', 'h1', 2), 'That play is not a basket.');
    const wrong = 'That basket was not made by that player for those points.';
    refused(s, unscore('b1', 'h2', 2), wrong);
    refused(s, unscore('b1', 'h1', 3), wrong);
    refused(s, unscore('b1', 'h1', 2, 'away'), wrong);
    s = play(s, unscore('b1', 'h1', 2));
    refused(s, unscore('b1', 'h1', 2), 'That basket is already taken back.');
    refused(
      play(s, { type: 'end' }),
      unscore('b1', 'h1', 2),
      'This game is final. Reopen it to make changes.',
    );
  });

  it('refuses a basket of another game, by its ID', () => {
    const other = play(started(), basket('h1', 2), 'elsewhere');
    assert.equal(derive(other).teams.home.score, 2);
    refused(started(), unscore('elsewhere', 'h1', 2), 'That basket is not in this game.');
  });

  for (const pts of [1, 2, 3])
    it(`takes back a basket of ${pts}: points, its count and the score`, () => {
      const before = play(started(), basket('h2', 1));
      let s = play(before, basket('h1', pts), 'x');
      s = play(s, basket('a1', 2, 'away'));
      s = play(s, unscore('x', 'h1', pts));
      const d = derive(s);
      assert.partialDeepStrictEqual(d.players['h1'], { points: 0, fg1: 0, fg2: 0, fg3: 0 });
      assert.equal(d.players['h2']?.points, 1);
      assert.equal(d.teams.home.score, 1);
      assert.equal(d.teams.away.score, 2);
      assert.deepEqual(scoreByPeriod(s.plays), { home: [1], away: [2] });
    });

  it('moves a basket: taken back from one player and made by another', () => {
    let s = play(started(), basket('h1', 2), 'wrong');
    s = play(s, basket('h3', 3));
    s = play(s, unscore('wrong', 'h1', 2));
    s = play(s, basket('h2', 2));
    const d = derive(s);
    assert.equal(d.players['h1']?.points, 0);
    assert.partialDeepStrictEqual(d.players['h2'], { points: 2, fg2: 1 });
    assert.equal(d.teams.home.score, 5);
  });

  it('takes back a basket of an earlier period from that period only', () => {
    let s = play(started(), basket('h1', 3), 'q1');
    s = play(s, basket('h1', 2));
    s = play(s, { type: 'period', period: 2 });
    s = play(s, basket('h1', 2));
    s = play(s, { type: 'period', period: 3 });
    s = play(s, unscore('q1', 'h1', 3));
    assert.deepEqual(scoreByPeriod(s.plays), { home: [2, 2], away: [0, 0] });
    const d = derive(s);
    assert.equal(d.period, 3);
    assert.partialDeepStrictEqual(d.players['h1'], { points: 4, fg2: 2, fg3: 0 });
  });

  it('gives the lead back, and leaves the running clock the mercy rule switched on (S-120)', () => {
    let s = started({ ...HALVES, mercyLead: 10 });
    s = play(s, basket('a1', 2, 'away'));
    for (let i = 0; i < 3; i += 1) s = play(s, basket('h1', 3));
    assert.equal(derive(s).clockMode, 'stop');
    s = play(s, basket('h2', 3), 'tipped');
    assert.equal(s.plays.at(-1)?.mercyClock, true);
    assert.equal(derive(s).clockMode, 'running');
    s = play(s, unscore('tipped', 'h2', 3));
    const d = derive(s);
    assert.equal(d.teams.home.score - d.teams.away.score, 7);
    assert.equal(d.clockMode, 'running');
    s = play(s, { type: 'clock-mode', mode: 'stop' });
    assert.equal(derive(s).clockMode, 'stop');
  });

  it('takes back the basket that had given the lead', () => {
    let s = play(started(), basket('a1', 2, 'away'));
    s = play(s, basket('h1', 3), 'lead');
    assert.ok(derive(s).teams.home.score > derive(s).teams.away.score);
    s = play(s, unscore('lead', 'h1', 3));
    assert.ok(derive(s).teams.away.score > derive(s).teams.home.score);
  });

  it('is undone like any play, and redone', () => {
    const made = play(play(started(), basket('h1', 2), 'b'), basket('h2', 2));
    const taken = play(made, unscore('b', 'h1', 2));
    const undone = play(taken, { type: 'undo' });
    assert.deepEqual(derive(undone), derive(made));
    assert.deepEqual(undone.plays, made.plays);
    const redone = play(undone, { type: 'redo' });
    assert.deepEqual(derive(redone), derive(taken));
    // The basket is not the last play while its take-back stands, so Undo takes the take-back.
    assert.equal(play(taken, { type: 'undo' }).plays.at(-1)?.type, 'score');
  });

  it('keeps both lines in the play list, and the running score turns at the take-back', () => {
    let s = play(started(), basket('h1', 2), 'b');
    s = play(s, basket('h2', 3));
    s = play(s, unscore('b', 'h1', 2));
    const shown = s.plays.slice(2);
    assert.deepEqual(
      shown.map((p) => describePlay(p, (id) => id.toUpperCase())),
      ['H1 +2', 'H2 +3', 'Basket taken back — H1 +2'],
    );
    assert.deepEqual(
      runningScores(shown).map((r) => r.home),
      [2, 5, 3],
    );
  });

  it('leaves no statistics when every basket was taken back: the game cannot end so', () => {
    let s = play(started(), basket('h1', 2), 'b');
    s = play(s, unscore('b', 'h1', 2));
    assert.equal(hasRecordedStats(s), false);
    refused(s, { type: 'end' }, 'Nothing is recorded for this game yet.');
    s = play(s, { type: 'foul', side: 'away', playerId: 'a1' });
    assert.equal(hasRecordedStats(s), true);
    assert.equal(play(s, { type: 'end' }).status, 'final');
  });

  it('is followed by more plays as by any other', () => {
    let s = play(started(), basket('h1', 2), 'b');
    s = play(s, unscore('b', 'h1', 2));
    s = play(s, { type: 'foul', side: 'home', playerId: 'h1' });
    s = play(s, basket('h1', 1));
    s = play(s, { type: 'sub', side: 'home', inId: 'h6', outId: 'h1' });
    s = play(s, basket('h6', 2));
    const d = derive(s);
    assert.partialDeepStrictEqual(d.players['h1'], { points: 1, fg1: 1, fg2: 0, fouls: 1 });
    assert.equal(d.teams.home.score, 3);
    assert.equal(d.teams.home.fouls, 1);
  });
});
