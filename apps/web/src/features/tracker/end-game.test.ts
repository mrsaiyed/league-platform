// Ending a game, worked out (step 2.37; checklist J1 to J5): what the End game question
// says or why the game cannot end, what the final panel says of the result and of
// reopening, and what the Mark not started question says. The game is played on the
// engine itself, so every number is the engine's own.
import { createTranslator } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  earlyText,
  endOfferText,
  endQuestion,
  endRefusedText,
  notStartedProblemText,
  notStartedQuestion,
  reopenLine,
  reopenLineText,
  reopenKeepsTrying,
  reopenMayRetry,
  reopenOffered,
  reopenProblemText,
  scoreText,
  takeBackProblemText,
  wonText,
} from './end-game.ts';
import { played, tippedOff } from './scoring-test-game.test-helper.ts';

const t = createTranslator('en');
const names = { home: 'Hawks', away: 'Bears' };
const basket = (playerId: string, points: 1 | 2 | 3 = 2): basketball.Command => ({
  type: 'score',
  side: playerId.startsWith('h') ? 'home' : 'away',
  playerId,
  points,
});
const running = { over: false, text: '12:34' };
const ranOut = { over: true, text: '0:00' };
/** A game in its last period: two halves, the second picked. */
const secondHalf = (commands: readonly basketball.Command[]) =>
  played([{ type: 'period', period: 2 }, ...commands], tippedOff(basketball.HALVES));

describe('the End game question (J1 to J3; S-73)', () => {
  it('says the score, home first, and nothing more once the last period has run out', () => {
    const game = secondHalf([basket('h5', 3), basket('a7')]);
    expect(endQuestion(game, names, false, ranOut, t)).toEqual({
      kind: 'ask',
      score: 'Hawks 3, Bears 2',
      tie: false,
      early: null,
    });
    expect(scoreText(game, names, t)).toBe('Hawks 3, Bears 2');
  });

  it('ended in the middle of a period, says that time is still on the clock, and in which period', () => {
    const game = secondHalf([basket('h5')]);
    const question = endQuestion(game, names, false, running, t);
    expect(question.kind).toBe('ask');
    if (question.kind !== 'ask' || question.early === null) throw new Error('not asked');
    // The time stands by itself, so the screen can let it tick with the game clock.
    expect(question.early).toEqual({
      before: 'H2 still has ',
      clock: '12:34',
      after: ' on the clock.',
    });
    expect(earlyText(question.early)).toBe('H2 still has 12:34 on the clock.');
  });

  it('ended at the end of an earlier period, says which period has not been played', () => {
    const game = played([basket('h5')], tippedOff(basketball.HALVES));
    const question = endQuestion(game, names, false, ranOut, t);
    if (question.kind !== 'ask' || question.early === null) throw new Error('not asked');
    expect(earlyText(question.early)).toBe('H1 is over, and H2 has not been played.');
    const quarters = played([{ type: 'period', period: 3 }, basket('h5')], tippedOff());
    const third = endQuestion(quarters, names, false, ranOut, t);
    if (third.kind !== 'ask' || third.early === null) throw new Error('not asked');
    expect(earlyText(third.early)).toBe('Q3 is over, and Q4 has not been played.');
  });

  it('an overtime that has run out is the end of the game: nothing is said of time', () => {
    const game = played(
      [{ type: 'period', period: 3 }, basket('a3')],
      tippedOff(basketball.HALVES),
    );
    expect(endQuestion(game, names, false, ranOut, t)).toMatchObject({ kind: 'ask', early: null });
  });

  it('a level score in a season with no ties is refused on the device, with nothing asked', () => {
    const game = secondHalf([basket('h5'), basket('a7')]);
    // At the end of the last period: overtime is what is left.
    expect(endQuestion(game, names, false, ranOut, t)).toEqual({
      kind: 'level',
      score: 'Hawks 2, Bears 2',
      early: null,
    });
    expect(t('tracker.end.level')).toContain('Play overtime');
  });

  it('a level score with time still to play is refused too, saying that time, not overtime (fix round, F3)', () => {
    const game = secondHalf([basket('h5'), basket('a7')]);
    // Whatever the clock says: a level game is not ended early either.
    const question = endQuestion(game, names, false, running, t);
    if (question.kind !== 'level' || question.early === null) throw new Error('no time said');
    expect(earlyText(question.early)).toBe(
      `This season allows no ties, so a level game cannot end. H2 still has ${running.text} to play.`,
    );
    expect(earlyText(question.early)).not.toContain('overtime');
    // The first half run out level: the second is still to play.
    const first = played([basket('h5'), basket('a7')], tippedOff(basketball.HALVES));
    const half = endQuestion(first, names, false, ranOut, t);
    if (half.kind !== 'level' || half.early === null) throw new Error('no period said');
    expect(earlyText(half.early)).toBe(
      'This season allows no ties, so a level game cannot end. H1 is over, and H2 is still to play.',
    );
  });

  it('rosters an older page stored, with no word on ties, are read as ties allowed: the league still decides (fix round, F5)', () => {
    const game = secondHalf([basket('h5'), basket('a7')]);
    expect(endQuestion(game, names, undefined, ranOut, t)).toMatchObject({
      kind: 'ask',
      tie: true,
    });
  });

  it('a level score in a season that allows ties is asked about, and says the game ends as a tie', () => {
    const game = secondHalf([basket('h5'), basket('a7')]);
    expect(endQuestion(game, names, true, ranOut, t)).toMatchObject({ kind: 'ask', tie: true });
    expect(t('tracker.end.ask.level')).toBe('The score is level, so the game ends as a tie.');
  });

  it('a game with nothing recorded is not asked about: the engine’s own sentence (J2)', () => {
    const none = tippedOff(basketball.HALVES);
    expect(endQuestion(none, names, true, running, t)).toEqual({
      kind: 'nothing',
      text: 'Nothing is recorded for this game yet.',
    });
  });

  it('the question never changes the game it asks about', () => {
    const game = secondHalf([basket('h5')]);
    const before = JSON.stringify(game);
    endQuestion(game, names, false, ranOut, t);
    expect(JSON.stringify(game)).toBe(before);
    expect(game.status).toBe('live');
  });
});

describe('End game offered in the pad (S-65)', () => {
  it('names the period that ran out and who leads, the higher score first', () => {
    const game = secondHalf([basket('h5'), basket('a7', 3), basket('a3')]);
    expect(endOfferText(game, names, t)).toBe(
      'H2 is over. Bears lead 5–2: end the game once the score is right.',
    );
  });
});

describe('the final panel’s words (J4)', () => {
  it('says who won in words with the score, the winner’s first; or that it was a tie', () => {
    const away = secondHalf([basket('h5'), basket('a7', 3)]);
    expect(wonText(away, names, t)).toBe('Bears won, 3–2');
    expect(wonText(secondHalf([basket('h5', 3)]), names, t)).toBe('Hawks won, 3–0');
    expect(wonText(secondHalf([basket('h5'), basket('a7')]), names, t)).toBe('A tie, 2–2');
  });

  it('says what the league answered to an End it did not take', () => {
    const level = secondHalf([basket('h5'), basket('a7')]);
    expect(endRefusedText(level, 'The score is level and…', t)).toEqual({
      level: true,
      text: 'The league did not take End game: the score is level and this season allows no ties. Play overtime until a team is ahead.',
    });
    const ahead = secondHalf([basket('h5')]);
    expect(endRefusedText(ahead, 'This game is final. Reopen it to make changes.', t)).toEqual({
      level: false,
      text: 'The league did not take End game: This game is final. Reopen it to make changes.',
    });
  });

  it('says why an End was not taken back', () => {
    expect(takeBackProblemText({ ok: false, reason: 'already-saved' }, t)).toContain(
      'Reopen it instead.',
    );
    expect(takeBackProblemText({ ok: false, reason: 'not-waiting' }, t)).toContain(
      'Reopen it instead.',
    );
    expect(takeBackProblemText({ ok: false, reason: 'storage' }, t)).toBe(
      'This device could not take End game back. Try again.',
    );
  });
});

describe('Reopen on the final panel (S-36)', () => {
  const sentAt = 1_000_000;
  const until = (ms: number) =>
    ({ reopen: { when: 'until', until: ms }, endedBy: null, sentAt }) as const;

  it('counts the minutes left from the server’s time, a started minute as a whole one', () => {
    expect(reopenLine(until(sentAt + 30 * 60_000), sentAt)).toEqual({ kind: 'left', minutes: 30 });
    expect(reopenLine(until(sentAt + 29 * 60_000 + 1), sentAt)).toEqual({
      kind: 'left',
      minutes: 30,
    });
    expect(reopenLine(until(sentAt + 1), sentAt)).toEqual({ kind: 'left', minutes: 1 });
    expect(reopenLineText({ kind: 'left', minutes: 30 }, t)).toBe(
      'You can reopen it for 30 more minutes.',
    );
    expect(reopenLineText({ kind: 'left', minutes: 1 }, t)).toBe(
      'You can reopen it for 1 more minute.',
    );
  });

  it('once the time is over it says so, and that a league admin can: no button, no reason typed first', () => {
    const line = reopenLine(until(sentAt), sentAt);
    expect(line).toEqual({ kind: 'no', code: 'reopen-time-over', endedBy: null });
    expect(reopenOffered(line)).toBe(false);
    expect(reopenLineText(line, t)).toBe(
      'It is too long since this game ended to reopen it here. A league admin can reopen it.',
    );
  });

  it('someone who may correct games can reopen at any time', () => {
    const line = reopenLine({ reopen: { when: 'always' }, endedBy: null, sentAt }, sentAt);
    expect(reopenOffered(line)).toBe(true);
    expect(reopenLineText(line, t)).toBe('You can reopen it at any time.');
  });

  it('names who ended the game when only they can reopen it', () => {
    const line = reopenLine(
      {
        reopen: { when: 'no', code: 'not-ended-by-you' },
        endedBy: { displayName: 'Sam Scorekeeper' },
        sentAt,
      },
      sentAt,
    );
    expect(reopenOffered(line)).toBe(false);
    expect(reopenLineText(line, t)).toBe(
      'Sam Scorekeeper ended this game, so only they can reopen it here. A league admin can reopen it.',
    );
  });

  it('while the league has not answered, the button is still offered and the panel says it is checking', () => {
    const line = reopenLine(null, sentAt);
    expect(line).toEqual({ kind: 'checking' });
    expect(reopenOffered(line)).toBe(true);
    expect(reopenLineText(line, t)).toBe('Checking whether this game can be reopened here…');
  });

  it('says why a reopen did not happen, and whether asking again as it stands can help', () => {
    const noSignal = { ok: false, reason: 'unanswered' } as const;
    expect(reopenProblemText(noSignal, t)).toBe('No connection. Try again when it is back.');
    expect(reopenMayRetry(noSignal)).toBe(true);
    // With no connection it is asked again by itself (point 7); plays going out are not.
    expect(reopenKeepsTrying(noSignal)).toBe(true);
    expect(reopenKeepsTrying({ ok: false, reason: 'plays-waiting' })).toBe(false);
    expect(reopenKeepsTrying({ ok: false, reason: 'signed-out' })).toBe(false);
    expect(reopenMayRetry({ ok: false, reason: 'plays-waiting' })).toBe(true);
    const late = {
      ok: false,
      reason: 'refused',
      code: 'reopen-time-over',
      endedBy: null,
    } as const;
    expect(reopenProblemText(late, t)).toContain('A league admin can reopen it.');
    expect(reopenMayRetry(late)).toBe(false);
    const other = {
      ok: false,
      reason: 'refused',
      code: 'not-ended-by-you',
      endedBy: 'Sam Scorekeeper',
    } as const;
    expect(reopenProblemText(other, t)).toContain('Sam Scorekeeper ended this game');
  });
});

describe('the Mark not started question (J5; S-40)', () => {
  it('with no basket, foul or turnover standing, anyone who scores is simply asked', () => {
    const game = tippedOff(basketball.HALVES);
    for (const mayCorrect of [false, true]) {
      expect(notStartedQuestion(game, names, mayCorrect, t)).toEqual({
        kind: 'clear',
        text: 'Its score and every stat recorded for it are cleared, here and on the live page. It shows as scheduled again.',
      });
    }
    // A play undone is nothing recorded.
    const undone = played([basket('h5'), { type: 'undo' }], game);
    expect(notStartedQuestion(undone, names, false, t).kind).toBe('clear');
  });

  it('with plays standing a scorekeeper is told to undo them first, and how many', () => {
    const game = played(
      [basket('h5'), { type: 'foul', side: 'away', playerId: 'a3' }],
      tippedOff(basketball.HALVES),
    );
    expect(notStartedQuestion(game, names, false, t)).toEqual({
      kind: 'undo-first',
      text: '2 baskets, fouls or turnovers are recorded. Undo them first, then mark the game not started.',
    });
    expect(notStartedQuestion(played([basket('h5')], tippedOff()), names, false, t).text).toBe(
      '1 basket, foul or turnover is recorded. Undo it first, then mark the game not started.',
    );
  });

  it('someone who may correct games is told how many plays and what score will be cleared', () => {
    const game = played([basket('h5'), basket('a7', 3)], tippedOff(basketball.HALVES));
    expect(notStartedQuestion(game, names, true, t)).toEqual({
      kind: 'clears',
      text: '2 plays and the score, Hawks 2, Bears 3, will be cleared.',
    });
  });

  it('says the league’s refusal, or the device’s own problem, in a sentence', () => {
    expect(
      notStartedProblemText({ ok: false, reason: 'refused', code: 'plays-recorded' }, t),
    ).toContain('Undo them first');
    expect(notStartedProblemText({ ok: false, reason: 'unanswered' }, t)).toBe(
      'No connection. Try again when it is back.',
    );
    expect(notStartedProblemText({ ok: false, reason: 'plays-waiting' }, t)).toContain(
      'Plays are still waiting to send.',
    );
  });
});
