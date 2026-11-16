// The game clock's logic (step 2.36): read from the engine's state and the server's time,
// with the engine itself playing every game here, so what a test expects is the engine's
// own result (checklist T2 to T10 of the 2.107 audit; findings M1 and M2).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  clockEntry,
  clockEntryKey,
  minutesMoved,
  minutesNow,
  periodChoices,
  periodEnd,
  readClock,
  setEffect,
  startOffered,
  stopKey,
  stopReason,
} from './game-clock.ts';
import { played, tippedOff } from './scoring-test-game.test-helper.ts';

/** Applies one command at `now`, the server's time. */
const at = (
  game: basketball.GameState,
  now: number,
  command: basketball.Command,
): basketball.GameState => basketball.apply(game, command, { id: `c-${now}`, now });

describe('reading the clock from the server’s time (T3, finding M1)', () => {
  it('counts down from when it was started, and stops at 0:00', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    expect(readClock(started, 10_000)).toMatchObject({ text: '8:00', running: true, over: false });
    expect(readClock(started, 12_500).text).toBe('7:58');
    expect(readClock(started, 70_000)).toMatchObject({ text: '7:00', elapsedMs: 60_000 });
    // A tablet that slept through the rest of the period wakes to a clock at zero.
    const end = readClock(started, 10_000 + 8 * 60_000 + 5_000);
    expect(end).toMatchObject({ text: '0:00', running: false, over: true, remainingMs: 0 });
    expect(end.elapsedMs).toBe(8 * 60_000);
  });

  it('stands still while stopped, whatever the time', () => {
    const paused = at(at(tippedOff(), 10_000, { type: 'start' }), 40_000, { type: 'pause' });
    expect(readClock(paused, 40_000).text).toBe('7:30');
    expect(readClock(paused, 4_000_000)).toMatchObject({ text: '7:30', running: false });
  });

  it('a time before the start reads the full clock, never more', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    expect(readClock(started, 9_000).text).toBe('8:00');
  });

  it('ticks a floor player’s minutes with the clock, and nobody else’s', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    const scored = at(started, 70_000, { type: 'score', side: 'home', playerId: 'h3', points: 2 });
    const base = basketball.derive(scored).players.h3?.ms ?? -1;
    expect(base).toBe(60_000);
    const reading = readClock(scored, 135_000);
    expect(minutesNow(scored, reading, base, true)).toBe('2:05');
    expect(minutesNow(scored, reading, 0, false)).toBe('0:00');
    // The same as the engine works out for that moment.
    const engine = basketball.derive(scored, reading.elapsedMs).players.h3?.ms ?? -1;
    expect(minutesNow(scored, reading, base, true)).toBe(basketball.formatMinutes(engine));
  });
});

describe('why the clock is stopped (T9)', () => {
  it('before the game: it starts at the tip', () => {
    expect(stopReason(tippedOff())).toEqual({ kind: 'tip-off' });
  });

  it('a foul on a stop clock stopped it, until it is started again', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    const fouled = at(started, 20_000, { type: 'foul', side: 'home', playerId: 'h3' });
    expect(readClock(fouled, 99_000)).toMatchObject({ text: '7:50', running: false });
    expect(stopReason(fouled)).toEqual({ kind: 'foul', side: 'home', playerId: 'h3' });
    // Free throws on the stopped clock do not change why it is stopped.
    const shot = at(fouled, 30_000, { type: 'score', side: 'away', playerId: 'a3', points: 1 });
    expect(stopReason(shot)).toEqual({ kind: 'foul', side: 'home', playerId: 'h3' });
    // Started and paused by hand: stopped, and no longer for the foul.
    const again = at(at(shot, 40_000, { type: 'start' }), 45_000, { type: 'pause' });
    expect(stopReason(again)).toEqual({ kind: 'stopped' });
  });

  it('a timeout stopped it', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    const called = at(started, 20_000, { type: 'timeout', side: 'away', seconds: 60 });
    expect(stopReason(called)).toEqual({ kind: 'timeout', side: 'away' });
  });

  it('a foul or a timeout since taken back is no longer the reason: the clock is just stopped (L4)', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    const fouled = at(started, 20_000, { type: 'foul', side: 'home', playerId: 'h3' });
    // Another player's foul taken back leaves the reason alone.
    const other = at(at(fouled, 21_000, { type: 'foul', side: 'home', playerId: 'h5' }), 22_000, {
      type: 'unfoul',
      side: 'home',
      playerId: 'h5',
    });
    expect(stopReason(other)).toEqual({ kind: 'foul', side: 'home', playerId: 'h3' });
    // A second foul on the same player, then one taken back: that takes back the second,
    // and the foul that stopped the clock still stands.
    const twice = at(other, 23_000, { type: 'foul', side: 'home', playerId: 'h3' });
    const once = at(twice, 24_000, { type: 'unfoul', side: 'home', playerId: 'h3' });
    expect(stopReason(once)).toEqual({ kind: 'foul', side: 'home', playerId: 'h3' });
    // Taken back as well: the foul the button named is gone, and it no longer names it.
    const none = at(once, 25_000, { type: 'unfoul', side: 'home', playerId: 'h3' });
    expect(basketball.derive(none).players['h3']?.fouls).toBe(0);
    expect(stopReason(none)).toEqual({ kind: 'stopped' });
    expect(readClock(none, 99_000)).toMatchObject({ text: '7:50', running: false });

    const called = at(started, 20_000, { type: 'timeout', side: 'away', seconds: 60 });
    // The other team's timeout, called and taken back on the stopped clock: no matter.
    const theirs = at(at(called, 21_000, { type: 'timeout', side: 'home', seconds: 60 }), 22_000, {
      type: 'untimeout',
      side: 'home',
    });
    expect(stopReason(theirs)).toEqual({ kind: 'timeout', side: 'away' });
    const back = at(theirs, 23_000, { type: 'untimeout', side: 'away' });
    expect(stopReason(back)).toEqual({ kind: 'stopped' });
  });

  it('under a running clock a foul does not stop it, and no reason says it did', () => {
    const running = tippedOff({ ...basketball.QUARTERS, clockMode: 'running' });
    const started = at(running, 10_000, { type: 'start' });
    const fouled = at(started, 20_000, { type: 'foul', side: 'home', playerId: 'h3' });
    expect(readClock(fouled, 25_000).running).toBe(true);
    const paused = at(fouled, 30_000, { type: 'pause' });
    expect(stopReason(paused)).toEqual({ kind: 'stopped' });
  });

  it('a period just picked: the start of it, until the clock is set or run', () => {
    const started = at(tippedOff(), 10_000, { type: 'start' });
    const second = at(started, 600_000, { type: 'period', period: 2 });
    expect(stopReason(second)).toEqual({ kind: 'period-start', period: 2 });
    const set = at(second, 610_000, { type: 'set-clock', ms: 7 * 60_000 });
    expect(stopReason(set)).toEqual({ kind: 'stopped' });
  });
});

describe('the large Start clock button (T7, T10)', () => {
  const offered = (game: basketball.GameState, now: number, hiddenFor: string | null = null) =>
    startOffered(game, readClock(game, now), {
      lineupsSet: true,
      period: basketball.derive(game).period,
      hiddenFor,
    });

  it('is offered while the clock is stopped with time left, and not while it runs', () => {
    const game = tippedOff();
    expect(offered(game, 5_000)).toBe(true);
    const started = at(game, 10_000, { type: 'start' });
    expect(offered(started, 11_000)).toBe(false);
    expect(offered(at(started, 20_000, { type: 'pause' }), 21_000)).toBe(true);
  });

  it('is not offered before the lineups are set, at 0:00, or on a final game', () => {
    const fresh = basketball.newGame(basketball.QUARTERS, 0);
    expect(
      startOffered(fresh, readClock(fresh, 0), { lineupsSet: false, period: 1, hiddenFor: null }),
    ).toBe(false);
    const started = at(tippedOff(), 10_000, { type: 'start' });
    expect(offered(started, 10_000 + 9 * 60_000)).toBe(false);
    const final = played(
      [{ type: 'score', side: 'home', playerId: 'h3', points: 2 }, { type: 'end' }],
      tippedOff(),
    );
    expect(offered(final, final.lastAt + 1)).toBe(false);
  });

  it('hidden with ×, it stays hidden for that stop only', () => {
    const paused = at(at(tippedOff(), 10_000, { type: 'start' }), 20_000, { type: 'pause' });
    const hidden = stopKey(paused, 1);
    expect(offered(paused, 21_000, hidden)).toBe(false);
    // Scoring on the stopped clock keeps it hidden.
    const shot = at(paused, 25_000, { type: 'score', side: 'home', playerId: 'h3', points: 1 });
    expect(offered(shot, 26_000, hidden)).toBe(false);
    // The clock stops again: the button is back.
    const again = at(at(shot, 30_000, { type: 'start' }), 35_000, { type: 'pause' });
    expect(offered(again, 36_000, hidden)).toBe(true);
    // And a new period shows it too.
    const second = at(shot, 40_000, { type: 'period', period: 2 });
    expect(
      startOffered(second, readClock(second, 41_000), {
        lineupsSet: true,
        period: 2,
        hiddenFor: hidden,
      }),
    ).toBe(true);
  });
});

describe('the end of a period (T4)', () => {
  it('says halftime at the middle of the game and the end of the period elsewhere', () => {
    expect(periodEnd(1, 4)).toBe('period');
    expect(periodEnd(2, 4)).toBe('halftime');
    expect(periodEnd(4, 4)).toBe('period');
    expect(periodEnd(1, 2)).toBe('halftime');
    expect(periodEnd(2, 2)).toBe('period');
    expect(periodEnd(5, 4)).toBe('period');
  });
});

describe('the clock’s keys (T5)', () => {
  const typed = (keys: string) => [...keys].reduce(clockEntryKey, '');

  it('fills from the right, as a scoreboard’s controller does', () => {
    expect(clockEntry(typed('630'))).toEqual({ text: '6:30', ms: 390_000, problem: null });
    expect(clockEntry(typed('8'))).toEqual({ text: '0:08', ms: 8_000, problem: null });
    expect(clockEntry(typed('800'))).toEqual({ text: '8:00', ms: 480_000, problem: null });
    expect(clockEntry(typed('1200'))).toEqual({ text: '12:00', ms: 720_000, problem: null });
    expect(clockEntry(typed('6000'))).toEqual({ text: '60:00', ms: 3_600_000, problem: null });
  });

  it('says what is wrong with a time the clock does not take', () => {
    expect(clockEntry('')).toEqual({ text: '0:00', ms: null, problem: 'empty' });
    expect(clockEntry(typed('75'))).toEqual({ text: '0:75', ms: null, problem: 'seconds' });
    expect(clockEntry(typed('6001'))).toEqual({ text: '60:01', ms: null, problem: 'range' });
    expect(clockEntry(typed('9959'))).toEqual({ text: '99:59', ms: null, problem: 'range' });
  });

  it('takes four digits and no more, a zero first as 0:00, and nothing but digits', () => {
    expect(typed('12345')).toBe('1234');
    expect(clockEntry(typed('0'))).toEqual({ text: '0:00', ms: 0, problem: null });
    expect(typed('005')).toBe('5');
    expect(clockEntryKey('63', ':')).toBe('63');
    expect(clockEntryKey('63', 'Enter')).toBe('63');
  });

  it('every time it takes, the engine takes too', () => {
    for (const keys of ['0', '1', '59', '100', '630', '2000', '6000']) {
      const entry = clockEntry(typed(keys));
      if (entry.ms === null) throw new Error(`${keys} was not taken`);
      const set = at(tippedOff(), 5_000, { type: 'set-clock', ms: entry.ms });
      expect(readClock(set, 6_000).text).toBe(entry.text);
    }
  });

  // These games keep the rule they were saved with (the engine's rules without
  // minutesFollow): the form says what that rule does. The new product's rule is below.
  it('knows when a time puts time back on the clock, which comes off the minutes', () => {
    const paused = at(at(tippedOff(), 10_000, { type: 'start' }), 100_000, { type: 'pause' });
    const reading = readClock(paused, 101_000);
    expect(reading.text).toBe('6:30');
    expect(setEffect(paused, 7 * 60_000, 101_000)).toEqual({
      kind: 'back',
      time: '0:30',
      wholePeriod: false,
    });
    expect(setEffect(paused, 6 * 60_000, 101_000)).toBeNull();
    // Before the clock has run there are no minutes to take off: the period starts there.
    expect(setEffect(tippedOff(), 8 * 60_000, 0)).toEqual({ kind: 'start', clock: '8:00' });
  });

  /** What the engine really took off the minutes when the clock was set. */
  const tookOff = (game: basketball.GameState, now: number, ms: number): number =>
    readClock(game, now).elapsedMs -
    readClock(at(game, now, { type: 'set-clock', ms }), now).elapsedMs;

  it('never says more than the engine takes: only time of the period being played (M-b)', () => {
    // A full first quarter, then the second: 8:00 on its clock, nothing run in it yet.
    const first = at(tippedOff(), 10_000, { type: 'start' });
    expect(readClock(first, 600_000)).toMatchObject({ text: '0:00', elapsedMs: 480_000 });
    const second = at(first, 610_000, { type: 'period', period: 2 });
    const fresh = readClock(second, 611_000);
    expect(fresh.text).toBe('8:00');
    // Typing 8:00 again changes nothing, and nothing of the first quarter is ever touched.
    expect(setEffect(second, 8 * 60_000, 611_000)).toEqual({ kind: 'start', clock: '8:00' });
    // A minute and a half into the second quarter, 6:30 on the clock.
    const paused = at(at(second, 620_000, { type: 'start' }), 710_000, { type: 'pause' });
    const reading = readClock(paused, 711_000);
    expect(reading.text).toBe('6:30');
    // 7:00 puts half a minute back: that comes off, and it is the engine's own figure.
    expect(setEffect(paused, 7 * 60_000, 711_000)).toEqual({
      kind: 'back',
      time: '0:30',
      wholePeriod: false,
    });
    expect(tookOff(paused, 711_000, 7 * 60_000)).toBe(30_000);
    // 8:00 puts a minute and a half back: all this quarter has run, and no more than it.
    expect(setEffect(paused, 8 * 60_000, 711_000)).toEqual({
      kind: 'back',
      time: '1:30',
      wholePeriod: true,
    });
    expect(tookOff(paused, 711_000, 8 * 60_000)).toBe(90_000);
  });

  it('a clock set lower by mistake, then put right: says the whole period comes off (M4)', () => {
    // 16:55 on a 20-minute half: each starter has played 3:05.
    const paused = at(at(tippedOff(basketball.HALVES), 10_000, { type: 'start' }), 195_000, {
      type: 'pause',
    });
    expect(readClock(paused, 196_000).text).toBe('16:55');
    // Set to 12:00 by mistake: lower, so nothing comes off, and the form says nothing.
    expect(setEffect(paused, 12 * 60_000, 196_000)).toBeNull();
    const wrong = at(paused, 200_000, { type: 'set-clock', ms: 12 * 60_000 });
    // Put right: 4:55 goes back on the clock, but what comes off the minutes is the 3:05
    // the half has run, which is all of it. The form says both, and the engine does it.
    expect(setEffect(wrong, 1_015_000, 201_000)).toEqual({
      kind: 'back',
      time: '3:05',
      wholePeriod: true,
    });
    expect(tookOff(wrong, 201_000, 1_015_000)).toBe(185_000);
    const right = at(wrong, 210_000, { type: 'set-clock', ms: 1_015_000 });
    expect(basketball.derive(paused).players['h3']?.ms).toBe(185_000);
    expect(basketball.derive(right).players['h3']?.ms).toBe(0);
  });

  it('on the game clock (the new product, S-71): set wrongly and put right, 3:05 stays 3:05', () => {
    const rules: basketball.Rules = { ...basketball.HALVES, minutesFollow: 'game-clock' };
    const paused = at(at(tippedOff(rules), 10_000, { type: 'start' }), 195_000, {
      type: 'pause',
    });
    expect(readClock(paused, 196_000).text).toBe('16:55');
    // 12:00 takes 4:55 off the clock: the form says it adds 4:55, and the engine does.
    expect(setEffect(paused, 12 * 60_000, 196_000)).toEqual({ kind: 'added', time: '4:55' });
    const wrong = at(paused, 200_000, { type: 'set-clock', ms: 12 * 60_000 });
    expect(minutesMoved(paused, readClock(paused, 200_000), wrong)).toEqual({
      kind: 'added',
      time: '4:55',
      even: true,
    });
    expect(basketball.derive(wrong).players['h3']?.ms).toBe(480_000);
    // Put right: the same 4:55 comes off again, not the half.
    expect(setEffect(wrong, 1_015_000, 201_000)).toEqual({
      kind: 'back',
      time: '4:55',
      wholePeriod: false,
    });
    expect(tookOff(wrong, 201_000, 1_015_000)).toBe(295_000);
    const right = at(wrong, 210_000, { type: 'set-clock', ms: 1_015_000 });
    expect(minutesMoved(wrong, readClock(wrong, 210_000), right)).toEqual({
      kind: 'back',
      time: '4:55',
      even: true,
    });
    expect(basketball.formatMinutes(basketball.derive(right).players['h3']?.ms ?? -1)).toBe('3:05');
    // The same time as the clock shows already moves nothing, and says nothing.
    expect(setEffect(right, 1_015_000, 211_000)).toBeNull();
    expect(minutesMoved(right, readClock(right, 211_000), right)).toBeNull();
    // Put back past a substitution: the player who went off in that stretch moves by less
    // than the figure, so the short form must not promise it to everyone (`even`).
    const subbed = at(
      at(at(tippedOff(rules), 10_000, { type: 'start' }), 70_000, {
        type: 'sub',
        side: 'home',
        inId: 'h13',
        outId: 'h3',
      }),
      130_000,
      { type: 'pause' },
    );
    const back = at(subbed, 131_000, { type: 'set-clock', ms: 20 * 60_000 });
    expect(minutesMoved(subbed, readClock(subbed, 131_000), back)).toEqual({
      kind: 'back',
      time: '2:00',
      even: false,
    });
    // Before the clock has run in the period, a set only says where the period starts.
    expect(setEffect(tippedOff(rules), 15 * 60_000, 0)).toEqual({ kind: 'start', clock: '15:00' });
  });

  it('refuses a time longer than the period being played, in words (L5)', () => {
    const half = basketball.periodMs(basketball.HALVES, 1);
    expect(clockEntry('2500', half)).toEqual({ text: '25:00', ms: null, problem: 'period' });
    expect(clockEntry('2001', half).problem).toBe('period');
    // The period's own length is taken, and so is anything under it.
    expect(clockEntry('2000', half)).toEqual({ text: '20:00', ms: 1_200_000, problem: null });
    expect(clockEntry('1959', half).problem).toBeNull();
    // Overtime is shorter: 5:00 in this format.
    const overtime = basketball.periodMs(basketball.HALVES, 3);
    expect(clockEntry('500', overtime).problem).toBeNull();
    expect(clockEntry('501', overtime).problem).toBe('period');
    // What the clock cannot hold at all is still said as that.
    expect(clockEntry('6001', half).problem).toBe('range');
    expect(clockEntry('75', half).problem).toBe('seconds');
  });
});

describe('the periods offered (T6)', () => {
  it('every regulation period and three overtimes, the current and the next marked', () => {
    const quarters = periodChoices(basketball.QUARTERS, 1);
    expect(quarters.map((c) => c.period)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(quarters.filter((c) => c.current).map((c) => c.period)).toEqual([1]);
    expect(quarters.filter((c) => c.next).map((c) => c.period)).toEqual([2]);
    expect(periodChoices(basketball.HALVES, 2).map((c) => c.period)).toEqual([1, 2, 3, 4, 5]);
  });

  it('more when the game ran past the third overtime', () => {
    expect(periodChoices(basketball.QUARTERS, 9).map((c) => c.period)).toHaveLength(9);
  });
});

describe('correcting the clock, and Undo (finding M2; T-110)', () => {
  it('a clock set wrongly is put right by setting it again', () => {
    const paused = at(at(tippedOff(), 10_000, { type: 'start' }), 100_000, { type: 'pause' });
    const wrong = at(paused, 110_000, { type: 'set-clock', ms: 7 * 60_000 });
    expect(readClock(wrong, 111_000).text).toBe('7:00');
    const right = at(wrong, 120_000, { type: 'set-clock', ms: 390_000 });
    expect(readClock(right, 121_000)).toMatchObject({ text: '6:30', running: false });
  });

  it('Undo takes back the last play, never a clock correction', () => {
    const scored = at(at(tippedOff(), 10_000, { type: 'start' }), 100_000, {
      type: 'score',
      side: 'home',
      playerId: 'h3',
      points: 2,
    });
    const set = at(scored, 110_000, { type: 'set-clock', ms: 7 * 60_000 });
    const undone = at(set, 120_000, { type: 'undo' });
    // The basket is gone; the clock still reads what it was set to.
    expect(basketball.derive(undone).teams.home.score).toBe(0);
    expect(readClock(undone, 121_000).text).toBe('7:00');
  });

  it('a period change is undone and the clock returns to where it was', () => {
    const paused = at(at(tippedOff(), 10_000, { type: 'start' }), 100_000, { type: 'pause' });
    expect(readClock(paused, 101_000).text).toBe('6:30');
    const second = at(paused, 110_000, { type: 'period', period: 2 });
    expect(readClock(second, 111_000).text).toBe('8:00');
    expect(basketball.derive(second).period).toBe(2);
    const undone = at(second, 120_000, { type: 'undo' });
    expect(basketball.derive(undone).period).toBe(1);
    expect(readClock(undone, 121_000)).toMatchObject({ text: '6:30', running: false });
  });
});
