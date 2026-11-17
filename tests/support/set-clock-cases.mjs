// The worked examples of docs/build/audits/minutes-and-a-set-clock.md (step 2.189), as
// scripts of taps the engine runs. Each takes the rules, so the same taps are run with
// minutes on the game clock (the new product, S-71) and without (the Al-Hadi tracker's
// rule, pinned as it is). Quarters of 8:00, five a side on the court, unless said.
import { apply, clockAt, derive, newGame } from '../../packages/sports/src/basketball/live.ts';

export const HOME = ['h1', 'h2', 'h3', 'h4', 'h5'];
export const AWAY = ['a1', 'a2', 'a3', 'a4', 'a5'];

/** A game run tap by tap: `tap(command, now)`; `minutes()` reads every player's ms. */
export function game(rules) {
  let n = 0;
  const g = {
    state: newGame(rules, 0),
    tap(command, now) {
      g.state = apply(g.state, command, { id: `t${++n}`, now });
      return g;
    },
    /** Every player's minutes in ms, as the game holds them now (or at `now`, clock running). */
    minutes(now) {
      const elapsed = now === undefined ? g.state.clock.elapsedMs : clockAt(g.state, now).elapsedMs;
      return Object.fromEntries(
        Object.entries(derive(g.state, elapsed).players).map(([id, line]) => [id, line.ms]),
      );
    },
    /** The plays of one type, with their stamps. */
    plays(type) {
      return g.state.plays.filter((p) => p.type === type);
    },
  };
  g.tap({ type: 'lineup', side: 'home', playerIds: HOME }, 0);
  g.tap({ type: 'lineup', side: 'away', playerIds: AWAY }, 0);
  g.tap({ type: 'start' }, 0);
  return g;
}

const score = (playerId) => ({ type: 'score', side: 'home', playerId, points: 2 });
const sub = { type: 'sub', side: 'home', inId: 'h6', outId: 'h1' };
const set = (ms) => ({ type: 'set-clock', ms });
const pause = { type: 'pause' };

/** 2:00 played, the clock paused at 6:00. */
const underway = (rules) => game(rules).tap(pause, 120_000);

export const cases = {
  /** As found on the screen: halves, 16:55, set to 12:00, set back to 16:55. */
  a0: (halves) =>
    game(halves)
      .tap(score('h1'), 60_000)
      .tap(pause, 185_000)
      .tap(set(720_000), 186_000)
      .tap(set(1_015_000), 187_000),
  /** Means 6:08, types 0:08, then sets 6:08. */
  a: (rules) => underway(rules).tap(set(8_000), 121_000).tap(set(368_000), 122_000),
  /** Set too high: h6 comes in for h1 at 6:30; 6:00, set to 7:30, set back to 6:00. */
  b: (rules) =>
    game(rules)
      .tap(sub, 90_000)
      .tap(pause, 120_000)
      .tap(set(450_000), 121_000)
      .tap(set(360_000), 122_000),
  /** The clock ran on to 5:40 after a whistle and is set to 6:00. */
  c: (rules) => game(rules).tap(pause, 140_000).tap(set(360_000), 141_000),
  /** 30 seconds were played with the clock stopped: 6:00 is set to 5:30, then the quarter is played out. */
  d: (rules) => underway(rules).tap(set(330_000), 121_000),
  /** 6:00 set to 0:08, h6 comes in for h1, set to 6:08. */
  e: (rules) =>
    underway(rules).tap(set(8_000), 121_000).tap(sub, 122_000).tap(set(368_000), 123_000),
  /** The first quarter played out, then the second picked; returns the game at that point. */
  f: (rules) =>
    game(rules)
      .tap({ type: 'period', period: 2 }, 490_000)
      .tap(set(420_000), 491_000)
      .tap(set(480_000), 492_000),
  /** After 1:00 of the second quarter, 7:00 set to 0:07 and back. */
  f2: (g) =>
    g
      .tap({ type: 'start' }, 500_000)
      .tap(pause, 560_000)
      .tap(set(7_000), 561_000)
      .tap(set(420_000), 562_000),
  /** The same in overtime: after 1:00 of it, 3:00 set to 0:07 and back. */
  f3: (g) =>
    g
      .tap({ type: 'period', period: 5 }, 563_000)
      .tap({ type: 'start' }, 570_000)
      .tap(pause, 630_000)
      .tap(set(7_000), 631_000)
      .tap(set(180_000), 632_000),
  /** A basket, then 6:00 set to 0:08, then Undo. */
  g: (rules) =>
    game(rules)
      .tap(score('h1'), 100_000)
      .tap(pause, 120_000)
      .tap(set(8_000), 121_000)
      .tap({ type: 'undo' }, 122_000),
  /** A mistake that ran on: 6:00 set to 0:08, 5 seconds run, set to 6:03. */
  ranOn: (rules) =>
    underway(rules)
      .tap(set(8_000), 121_000)
      .tap({ type: 'start' }, 130_000)
      .tap(pause, 135_000)
      .tap(set(363_000), 136_000),
  /** Above the start: 6:00 set to 9:00, 10 seconds run, set to 5:50. */
  aboveStart: (rules) =>
    underway(rules)
      .tap(set(540_000), 121_000)
      .tap({ type: 'start' }, 130_000)
      .tap(pause, 140_000)
      .tap(set(350_000), 141_000),
  /** Half a second: halves, paused at 16:54.6, set to 12:00, set to 16:55. */
  halfSecond: (halves) =>
    game(halves).tap(pause, 185_400).tap(set(720_000), 186_000).tap(set(1_015_000), 187_000),
};
