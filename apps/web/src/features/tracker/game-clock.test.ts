// The game clock's logic (step 2.36): read from the engine's state and the server's time,
// with the engine itself playing every game here, so what a test expects is the engine's
// own result (checklist T2 to T10 of the 2.107 audit; findings M1 and M2).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  clockEntry,
  clockEntryKey,
  minutesNow,
  periodChoices,
  periodEnd,
  putsBackMs,
  readClock,
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

  it('knows when a time puts time back on the clock, which comes off the minutes', () => {
    const paused = at(at(tippedOff(), 10_000, { type: 'start' }), 100_000, { type: 'pause' });
    const reading = readClock(paused, 101_000);
    expect(reading.text).toBe('6:30');
    expect(putsBackMs(reading, 7 * 60_000)).toBe(30_000);
    expect(putsBackMs(reading, 6 * 60_000)).toBe(0);
    // Before the clock has run there are no minutes to take off.
    expect(putsBackMs(readClock(tippedOff(), 0), 9 * 60_000)).toBe(0);
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
