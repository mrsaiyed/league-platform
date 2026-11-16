// What the scoring screen says about the plays (step 2.37): the log's rows, the play
// Undo and Redo name, the sentence after each, and where a game stands once End game is
// tapped. The game is played on the engine itself, so every number is the engine's own.
import { createTranslator } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { playKeys, playShortText } from './engine-words.ts';
import {
  endOffered,
  endState,
  finalScore,
  playLog,
  recordedPlays,
  redoTarget,
  redoneText,
  refusedEnd,
  undoTarget,
  undoneText,
} from './play-log.ts';
import type { KeptTap } from './queue-storage.ts';
import {
  awayFive,
  homeFive,
  played,
  testRosters,
  tippedOff,
} from './scoring-test-game.test-helper.ts';

const t = createTranslator('en');
const basket = (playerId: string, points: 1 | 2 | 3 = 2): basketball.Command => ({
  type: 'score',
  side: playerId.startsWith('h') ? 'home' : 'away',
  playerId,
  points,
});
const waitingTap = (commandId: string, input: basketball.Command = { type: 'undo' }): KeptTap =>
  ({ command: { commandId, at: 0, input }, moment: null }) as KeptTap;
const lastId = (game: basketball.GameState) => game.plays.at(-1)?.id ?? '';

describe('the play log (checklist I4)', () => {
  it('lists every play newest first, each with its period, its clock and, after a basket, the score', () => {
    const game = played(
      [basket('h5'), { type: 'foul', side: 'away', playerId: 'a3' }, basket('a7', 3)],
      tippedOff(),
    );
    const log = playLog(game, testRosters, [], t);
    expect(log.rows.map((row) => row.text)).toEqual([
      '#7 Uma Bearsley +3',
      'Foul on #3 Sol Bearsley',
      '#5 Ned Hawkins +2',
      'Bears starters: #3 Sol Bearsley, #5 Tam Bearsley, #7 Uma Bearsley, #9 Vic Bearsley, #11 Wes Bearsley',
      'Hawks starters: #3 Max Hawkins, #5 Ned Hawkins, #7 Oz Hawkins, #9 Pia Hawkins, #11 Quin Hawkins',
    ]);
    expect(log.rows.map((row) => row.score)).toEqual(['2–3', null, '2–0', null, null]);
    expect(log.rows.every((row) => /^Q1 \d+:\d\d$/.test(row.when))).toBe(true);
    expect(log.unsent).toBe(0);
    expect(log.count).toBe(5);
  });

  it('gives only the newest rows when asked, with the count, the unsent and the score of the whole game', () => {
    const game = played(
      [basket('h5'), { type: 'foul', side: 'away', playerId: 'a3' }, basket('a7', 3), basket('h9')],
      tippedOff(),
    );
    // The first basket's tap is still waiting: it is not among the two newest rows.
    const firstBasket = game.plays[2]?.id ?? '';
    const log = playLog(game, testRosters, [waitingTap(firstBasket)], t, 2);
    expect(log.rows.map((row) => row.text)).toEqual(['#9 Pia Hawkins +2', '#7 Uma Bearsley +3']);
    // The running score counts the baskets before the rows shown.
    expect(log.rows.map((row) => row.score)).toEqual(['4–3', '2–3']);
    expect(log.count).toBe(6);
    expect(log.unsent).toBe(1);
    // Asked for more than there are: all of them.
    expect(playLog(game, testRosters, [], t, 50).rows).toHaveLength(6);
    expect(playLog(game, testRosters, [], t, 0).rows).toEqual([]);
  });

  it('marks the plays the league does not have yet, by their taps’ ids, whatever their case', () => {
    const game = played([basket('h5'), basket('a7', 3)], tippedOff());
    const log = playLog(game, testRosters, [waitingTap(lastId(game).toUpperCase())], t);
    expect(log.rows.map((row) => row.unsent)).toEqual([true, false, false, false]);
    expect(log.unsent).toBe(1);
  });

  it('has a row for a game with no plays: none', () => {
    expect(playLog(basketball.newGame(basketball.QUARTERS, 0), testRosters, [], t)).toEqual({
      rows: [],
      count: 0,
      unsent: 0,
    });
  });
});

describe('what Undo and Redo name (checklist I1, I3)', () => {
  it('Undo names the latest play in the tracker’s words and shortest; Redo the one it brings back', () => {
    const game = played([basket('h5'), basket('a7', 3)], tippedOff());
    expect(undoTarget(game, testRosters, t)).toEqual({
      text: '#7 Uma Bearsley +3',
      short: '+3 #7 Uma',
    });
    expect(redoTarget(game, testRosters, t)).toBeNull();
    const undone = played([{ type: 'undo' }], game);
    expect(undoTarget(undone, testRosters, t)?.text).toBe('#5 Ned Hawkins +2');
    expect(redoTarget(undone, testRosters, t)).toEqual({
      text: '#7 Uma Bearsley +3',
      short: '+3 #7 Uma',
    });
  });

  it('names nothing before the first play, and nothing once the game is final', () => {
    const fresh = basketball.newGame(basketball.QUARTERS, 0);
    expect(undoTarget(fresh, testRosters, t)).toBeNull();
    const final = played(
      [basket('h5'), { type: 'undo' }, basket('h5'), { type: 'end' }],
      tippedOff(),
    );
    expect(undoTarget(final, testRosters, t)).toBeNull();
    expect(redoTarget(final, testRosters, t)).toBeNull();
  });

  it('has short words for every kind of play the engine has', () => {
    const plays: basketball.Play[] = [
      { type: 'score', side: 'home', playerId: 'h5', points: 2 },
      { type: 'foul', side: 'home', playerId: 'h5' },
      { type: 'unfoul', side: 'home', playerId: 'h5' },
      { type: 'turnover', side: 'home', playerId: 'h5' },
      { type: 'unturnover', side: 'home', playerId: 'h5' },
      { type: 'team-turnover', side: 'away' },
      { type: 'team-unturnover', side: 'away' },
      { type: 'timeout', side: 'away', seconds: 60 },
      { type: 'untimeout', side: 'away' },
      { type: 'sub', side: 'home', inId: 'h13', outId: 'h5' },
      { type: 'lineup', side: 'home', playerIds: homeFive },
      { type: 'period', period: 5 },
      { type: 'clock-mode', mode: 'running' },
      { type: 'clock-mode', mode: 'stop' },
    ];
    expect(new Set(plays.map((play) => play.type))).toEqual(new Set(Object.keys(playKeys)));
    expect(plays.map((play) => playShortText(play, testRosters, 4, t))).toEqual([
      '+2 #5 Ned',
      'Foul #5 Ned',
      '−Foul #5 Ned',
      // The one long word comes after the player: a cut line keeps the number.
      '#5 Ned turnover',
      '#5 Ned −turnover',
      'Team turnover',
      '−Team turnover',
      'Timeout Bears',
      '−Timeout Bears',
      'Sub #13 Ray',
      'Starters Hawks',
      'Start OT1',
      'Running clock',
      'Stop clock',
    ]);
  });
});

describe('what the screen says once Undo or Redo is done (checklist I2)', () => {
  const after = (game: basketball.GameState) => played([{ type: 'undo' }], game);
  const said = (game: basketball.GameState) => undoneText(game, after(game), testRosters, t);

  it('a basket: the play in the tracker’s words', () => {
    expect(said(played([basket('h5')], tippedOff()))).toBe('Undone: #5 Ned Hawkins +2.');
  });

  it('a foul that had stopped the clock: the clock stays stopped, and it says so', () => {
    const stopClock = { ...basketball.QUARTERS, clockMode: 'stop' as const };
    const game = played(
      [{ type: 'start' }, { type: 'foul', side: 'home', playerId: 'h5' }],
      tippedOff(stopClock),
    );
    expect(game.plays.at(-1)?.stoppedClock).toBe(true);
    expect(said(game)).toBe(
      'Undone: Foul on #5 Ned Hawkins. The clock stays stopped: start it when play goes on.',
    );
  });

  it('a substitution: who is back on the court and who is on the bench', () => {
    const game = played([{ type: 'sub', side: 'home', inId: 'h13', outId: 'h5' }], tippedOff());
    expect(said(game)).toBe(
      'Undone: #5 Ned Hawkins is back on the court and #13 Ray Hawkins is on the bench.',
    );
  });

  it('a period change: the clock is back where it was', () => {
    const game = played([{ type: 'start' }, { type: 'period', period: 2 }], tippedOff());
    const back = after(game);
    expect(undoneText(game, back, testRosters, t)).toBe(
      `Undone: Start of Q2. The clock is back at ${basketball.formatClock(back.clock.remainingMs)}, stopped.`,
    );
    expect(back.clock.remainingMs).toBeLessThan(basketball.periodMs(game.rules, 1));
  });

  it('a timeout: the play, and Redo says what it brought back', () => {
    const game = played([{ type: 'timeout', side: 'away', seconds: 60 }], tippedOff());
    expect(said(game)).toBe('Undone: Full timeout: Bears.');
    expect(redoneText(after(game), testRosters, t)).toBe('Brought back: Full timeout: Bears.');
  });

  it('with nothing to act on, the refusal’s own sentence', () => {
    const fresh = basketball.newGame(basketball.QUARTERS, 0);
    expect(undoneText(fresh, fresh, testRosters, t)).toBe('There is nothing to undo.');
    expect(redoneText(fresh, testRosters, t)).toBe('There is nothing to redo.');
  });
});

describe('where a game stands once End game is tapped (checklist J1 to J4)', () => {
  const ahead = played([basket('h5')], tippedOff());
  const final = played([{ type: 'end' }], ahead);

  it('is live until ended, not sent while its End tap waits, saved once the league has it', () => {
    expect(endState({ game: ahead, waiting: [] })).toBe('live');
    expect(endState({ game: null, waiting: [] })).toBe('live');
    expect(endState({ game: final, waiting: [waitingTap('e1', { type: 'end' })] })).toBe(
      'not-sent',
    );
    // Other plays waiting do not make the End unsent.
    expect(endState({ game: final, waiting: [waitingTap('b1', basket('h5'))] })).toBe('saved');
    expect(endState({ game: final, waiting: [] })).toBe('saved');
  });

  it('finds the End the league refused, with its sentence, among other refused plays', () => {
    const refused = (commandId: string, input: basketball.Command, message: string) =>
      ({ command: { commandId, at: 0, input }, refusal: { code: 'rule', message } }) as never;
    expect(refusedEnd({ notApplied: [] })).toBeNull();
    expect(refusedEnd({ notApplied: [refused('b1', basket('h5'), 'no')] })).toBeNull();
    expect(
      refusedEnd({
        notApplied: [refused('b1', basket('h5'), 'no'), refused('e1', { type: 'end' }, 'level')],
      }),
    ).toEqual({ commandId: 'e1', message: 'level' });
  });

  it('says the score home first and who is ahead; null when it is level', () => {
    expect(finalScore(final)).toEqual({ home: 2, away: 0, ahead: 'home' });
    expect(finalScore(played([basket('a7', 3)], ahead)).ahead).toBe('away');
    expect(finalScore(played([basket('a7', 2)], ahead)).ahead).toBeNull();
  });

  it('the pad offers End game only when the last period’s clock has run out with a team ahead (S-65)', () => {
    const lastPeriod = played([{ type: 'period', period: 4 }], ahead);
    expect(endOffered(lastPeriod, true)).toBe(true);
    // The clock still has time, an earlier period, a level score, a game already final.
    expect(endOffered(lastPeriod, false)).toBe(false);
    expect(endOffered(ahead, true)).toBe(false);
    expect(endOffered(played([basket('a7', 2)], lastPeriod), true)).toBe(false);
    expect(endOffered(played([{ type: 'end' }], lastPeriod), true)).toBe(false);
    // Overtime over with a team ahead: offered too.
    expect(endOffered(played([{ type: 'period', period: 5 }], ahead), true)).toBe(true);
  });

  it('counts the baskets, fouls and turnovers that stand: what is undone before "not started"', () => {
    expect(recordedPlays(tippedOff())).toBe(0);
    const game = played(
      [
        basket('h5'),
        { type: 'foul', side: 'away', playerId: 'a3' },
        { type: 'turnover', side: 'home', playerId: 'h3' },
        { type: 'team-turnover', side: 'away' },
        { type: 'timeout', side: 'away', seconds: 60 },
      ],
      tippedOff(),
    );
    expect(recordedPlays(game)).toBe(4);
    expect(recordedPlays(played([{ type: 'undo' }, { type: 'undo' }], game))).toBe(3);
    expect(awayFive).toHaveLength(5);
  });
});
