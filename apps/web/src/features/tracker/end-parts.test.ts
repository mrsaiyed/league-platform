// Ending a game as it is drawn (step 2.37; checklist J1 to J5): End game behind More and
// offered in the pad, the question in each of its states, the final panel in each of
// its, the Reopen and Mark not started questions, and where the frame puts them. The
// game is played on the engine itself and the words are worked out by the screen's own
// (end-game.ts), so what is drawn is what a game gives.
import { createTranslator, en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CourtView, type CourtHandlers } from './court-view.tsx';
import { endOfferText, endQuestion, notStartedQuestion, wonText } from './end-game.ts';
import {
  EndAsk,
  EndOffer,
  FinalPanel,
  MoreEnd,
  MoreNotStarted,
  NotStartedAsk,
  ReopenAsk,
  type EndHandlers,
} from './end-parts.tsx';
import { padFor, type PadMode } from './scoring-moves.ts';
import { played, testRosters, tippedOff } from './scoring-test-game.test-helper.ts';
import { scoringView } from './scoring-view.ts';
import { trackerCatalog } from './tracker-catalog.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
const none = () => undefined;
const on: EndHandlers = {
  endAsk: none,
  endAnswer: none,
  takeBackEnd: none,
  reopenAsk: none,
  reopenAnswer: none,
  reopenReason: none,
  notStartedAsk: none,
  notStartedAnswer: none,
  notStartedReason: none,
  finalBack: none,
};
const names = { home: 'Hawks', away: 'Bears' };
const basket = (playerId: string, points: 1 | 2 | 3 = 2): basketball.Command => ({
  type: 'score',
  side: playerId.startsWith('h') ? 'home' : 'away',
  playerId,
  points,
});
/** The second half of a game of two halves, Hawks ahead 5 to 2. */
const ahead = played(
  [{ type: 'period', period: 2 }, basket('h5', 3), basket('a7'), basket('h9')],
  tippedOff(basketball.HALVES),
);
const level = played([basket('a3', 3)], ahead);
const running = { over: false, text: '12:34' };
const ranOut = { over: true, text: '0:00' };

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
/** What a button draws, from its opening tag to its end. */
const answer = (html: string, which: 'yes' | 'no'): string | null => {
  const at = html.indexOf(`data-answer="${which}"`);
  if (at === -1) return null;
  const from = html.lastIndexOf('<button', at);
  return html.slice(from, html.indexOf('</button>', from));
};

describe('End game behind More and offered in the pad (S6, S-65)', () => {
  it('is a button behind More that says it asks first; Mark not started beside it', () => {
    const end = renderToStaticMarkup(createElement(MoreEnd, { t, on }));
    expect(words(end)).toBe('End game Makes the game final. You are asked first.');
    expect(end).toContain('data-more-end=""');
    const clear = renderToStaticMarkup(createElement(MoreNotStarted, { t, on }));
    expect(words(clear)).toBe(
      'Mark not started For a game started by mistake, or only to try the tracker. You are asked first.',
    );
  });

  it('offered in the pad’s first line, it is the gold button with why under it', () => {
    const html = renderToStaticMarkup(
      createElement(EndOffer, { t, text: endOfferText(ahead, names, t), on }),
    );
    expect(html).toContain('data-kind="next"');
    expect(html).toContain('data-end-game=""');
    expect(html).toContain('aria-describedby="court-start-why"');
    expect(words(html)).toBe(
      'End game H2 is over. Hawks lead 5–2: end the game once the score is right.',
    );
  });
});

describe('the End game question (J1 to J3)', () => {
  const ask = (game: basketball.GameState, clock = ranOut, allowTies = false, refused?: string) =>
    renderToStaticMarkup(
      createElement(EndAsk, {
        t,
        question: endQuestion(game, names, allowTies, clock, t),
        refused: refused ?? null,
        working: false,
        on,
      }),
    );

  it('says the score and what ending does, with "Keep playing" before "End game" in the lowest band', () => {
    const html = ask(ahead);
    expect(words(html)).toBe(
      'End the game? Hawks 5, Bears 2 This becomes the final score and goes into the standings. A game ended by mistake can be reopened. Keep playing End game',
    );
    expect(html).toContain('data-ask-answers=""');
    expect(html.indexOf('data-answer="no"')).toBeLessThan(html.indexOf('data-answer="yes"'));
    // The answer that acts is the gold one, and both are read with what the question says.
    expect(answer(html, 'yes')).toContain('court-opt-next');
    expect(answer(html, 'no')).not.toContain('court-opt-next');
    expect(answer(html, 'yes')).toContain('aria-describedby="court-ask-text"');
    expect(html).toContain('role="group" aria-labelledby="court-ask-title"');
  });

  it('ended early, says that time is still on the clock, with the time where the clock’s ticker writes it', () => {
    const html = ask(ahead, running);
    expect(words(html)).toContain('Hawks 5, Bears 2 H2 still has 12:34 on the clock. This becomes');
    expect(html).toContain('<span data-clock-now="">12:34</span>');
    expect(html).toContain('data-ask-early=""');
  });

  it('at a level score with no ties there is no question: it says to play overtime, and offers only "Keep playing"', () => {
    const html = ask(level);
    expect(words(html)).toBe(
      'The score is level Hawks 5, Bears 5 This season allows no ties, so a level game cannot end. Play overtime until a team is ahead. Keep playing',
    );
    expect(answer(html, 'yes')).toBeNull();
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-end-refused=""');
  });

  it('at a level score with no ties and time on the clock, says that time is still to play, ticking, and not overtime', () => {
    const html = ask(level, running);
    expect(words(html)).toBe(
      'The score is level Hawks 5, Bears 5 This season allows no ties, so a level game cannot end. H2 still has 12:34 to play. Keep playing',
    );
    expect(html).toContain('<span data-clock-now="">12:34</span>');
    expect(answer(html, 'yes')).toBeNull();
  });

  it('at a level score in a season with ties, says the game ends as a tie', () => {
    const html = ask(level, ranOut, true);
    expect(words(html)).toContain(
      'Hawks 5, Bears 5 The score is level, so the game ends as a tie.',
    );
    expect(answer(html, 'yes')).not.toBeNull();
  });

  it('says what the league answered to an End it did not take, with nothing to answer but "Keep playing"', () => {
    const html = ask(level, ranOut, true, t('tracker.end.refusedLevel'));
    expect(words(html)).toBe(
      'The game is still live Hawks 5, Bears 5 The league did not take End game: the score is level and this season allows no ties. Play overtime until a team is ahead. Keep playing',
    );
    expect(answer(html, 'yes')).toBeNull();
  });

  it('with nothing left to end (the plays undone under the question) it says so', () => {
    const html = ask(tippedOff(basketball.HALVES));
    expect(words(html)).toBe('End the game? Nothing is recorded for this game yet. Keep playing');
    expect(answer(html, 'yes')).toBeNull();
  });

  it('while the End is being kept its button says so and takes no second tap', () => {
    const html = renderToStaticMarkup(
      createElement(EndAsk, {
        t,
        question: endQuestion(ahead, names, false, ranOut, t),
        refused: null,
        working: true,
        on,
      }),
    );
    expect(answer(html, 'yes')).toContain('aria-disabled="true"');
    expect(words(answer(html, 'yes') ?? '')).toBe('Ending…');
  });
});

describe('the final panel (J4)', () => {
  const final = played([{ type: 'end' }], ahead);
  const panel = (props: Partial<Parameters<typeof FinalPanel>[0]>) =>
    renderToStaticMarkup(
      createElement(FinalPanel, {
        t,
        won: wonText(final, names, t),
        ended: 'saved',
        reopenLine: 'You can reopen it for 30 more minutes.',
        reopenOffered: true,
        problem: null,
        working: false,
        back: '/made-up/admin',
        on,
        ...props,
      }),
    );

  it('saved: "Final", who won with the score, that it counts, Reopen with the time left, and the way out in gold', () => {
    const html = panel({});
    expect(words(html)).toBe(
      'Final Hawks won, 5–2 Saved. It counts in the standings. You can reopen it for 30 more minutes. Reopen game Back to the games',
    );
    expect(html).toContain('data-final="saved"');
    expect(html).toContain('data-reopen=""');
    expect(html).not.toContain('data-take-back');
    expect(html).toMatch(
      /<a class="court-opt court-opt-next" data-final-back="" href="\/made-up\/admin"/,
    );
    expect(html).toContain('role="group" aria-label="The game is final"');
  });

  it('not sent: says so in words, offers "Take back End game", and leaving is not the gold step', () => {
    const html = panel({ ended: 'not-sent' });
    expect(words(html)).toBe(
      'Final Hawks won, 5–2 Not sent yet. The league gets the result once the connection is back. Until then End game can be taken back here. Take back End game Back to the games',
    );
    expect(html).toContain('<span class="court-final-unsent">Not sent yet.</span>');
    expect(html).toContain('data-take-back=""');
    expect(html).not.toContain('data-reopen=""');
    expect(html).toMatch(/<a class="court-opt" data-final-back=""/);
  });

  it('just tapped, with a connection: it says the result is on its way, and the End can still be taken back', () => {
    const html = panel({ ended: 'sending' });
    expect(words(html)).toBe(
      'Final Hawks won, 5–2 Sending the result to the league… Take back End game Back to the games',
    );
  });

  it('once the league says no to reopening, the line says why and the button is gone, its place kept', () => {
    const html = panel({
      reopenOffered: false,
      reopenLine:
        'It is too long since this game ended to reopen it here. A league admin can reopen it.',
    });
    expect(html).not.toContain('data-reopen=""');
    expect(words(html)).toBe(
      'Final Hawks won, 5–2 Saved. It counts in the standings. It is too long since this game ended to reopen it here. A league admin can reopen it. Back to the games',
    );
    // "Back to the games" is still the second of the band's two places.
    expect(html).toMatch(/data-final-actions=""><span aria-hidden="true"><\/span><a /);
  });

  it('a problem stands where the reopen line stood, as an alert', () => {
    const html = panel({ problem: 'No connection. Try again when it is back.' });
    expect(html).toContain('role="alert" data-final-problem=""');
    expect(words(html)).toBe(
      'Final Hawks won, 5–2 Saved. It counts in the standings. No connection. Try again when it is back. Reopen game Back to the games',
    );
  });

  it('a tie is said as one', () => {
    const tied = played([{ type: 'end' }], level);
    expect(words(panel({ won: wonText(tied, names, t) }))).toContain('Final A tie, 5–5 Saved.');
  });
});

describe('the Reopen question (S-36)', () => {
  const ask = (props: Partial<Parameters<typeof ReopenAsk>[0]>) =>
    renderToStaticMarkup(
      createElement(ReopenAsk, {
        t,
        reason: '',
        problem: null,
        working: false,
        on,
        ...props,
      }),
    );

  // Before the fix round (F6) the field came filled in with the usual reason, to be
  // typed over; it now starts empty, with that reason one tap beside it.
  it('says what reopening does, with an empty reason field and the usual reason one tap beside it', () => {
    const html = ask({});
    expect(words(html)).toBe(
      'Reopen this game? It goes back to live with every play as it was, and stops counting in the standings until it is ended again. Why (kept with the game, never shown publicly) By mistake Keep it final Reopen the game',
    );
    expect(html).toMatch(
      /<input type="text" id="court-reopen-reason" class="court-input" data-reopen-reason=""[^>]*value=""/,
    );
    expect(html).toContain('maxLength="1000"');
    // The field is named by the words over it.
    expect(html).toMatch(
      /<label class="court-ask-field-label" for="court-reopen-reason">Why \(kept/,
    );
    expect(html).toMatch(
      /<button type="button" class="court-opt" data-reopen-mistake="" aria-label="Fill in the reason: End game tapped by mistake">By mistake<\/button>/,
    );
    expect(answer(html, 'yes')).toContain('court-opt-next');
  });

  it('a reason typed or picked stays in the field', () => {
    const html = ask({ reason: t('tracker.reopen.reasonReady') });
    expect(html).toMatch(/data-reopen-reason=""[^>]*value="End game tapped by mistake"/);
  });

  it('a problem stands where the explanation stood, and the question stays to be answered again', () => {
    const html = ask({ problem: 'No connection. Try again when it is back.' });
    expect(html).toContain('role="alert" data-ask-problem=""');
    expect(words(html)).toContain(
      'Reopen this game? No connection. Try again when it is back. Why',
    );
    expect(answer(html, 'yes')).not.toBeNull();
  });

  it('while the league is asked its button says so', () => {
    const html = ask({ working: true });
    expect(words(answer(html, 'yes') ?? '')).toBe('Reopening…');
    expect(answer(html, 'yes')).toContain('aria-disabled="true"');
  });
});

describe('the Mark not started question (J5; S-40)', () => {
  const stood = played([basket('h5'), basket('a7', 3)], tippedOff(basketball.HALVES));
  const ask = (
    game: basketball.GameState,
    mayCorrect: boolean,
    props: Partial<Parameters<typeof NotStartedAsk>[0]> = {},
  ) => {
    const question = notStartedQuestion(game, names, mayCorrect, t);
    return renderToStaticMarkup(
      createElement(NotStartedAsk, {
        t,
        question,
        askReason: question.kind === 'clears',
        reason: 'startedByMistake',
        problem: null,
        working: false,
        on,
        ...props,
      }),
    );
  };

  it('with nothing recorded it asks, the answer that clears in red after "Keep scoring"', () => {
    const html = ask(tippedOff(basketball.HALVES), false);
    expect(words(html)).toBe(
      'Mark this game as not started? Its score and every stat recorded for it are cleared, here and on the live page. It shows as scheduled again. Keep scoring Yes, mark not started',
    );
    expect(answer(html, 'yes')).toContain('court-opt-foul');
    expect(html).not.toContain('<select');
  });

  it('with plays standing a scorekeeper is told to undo them first, and is offered no "yes"', () => {
    const html = ask(stood, false);
    expect(words(html)).toBe(
      'Mark this game as not started? 2 baskets, fouls or turnovers are recorded. Undo them first, then mark the game not started. Keep scoring',
    );
    expect(answer(html, 'yes')).toBeNull();
  });

  it('someone who may correct games is told what is cleared and picks a reason from the fixed list', () => {
    const html = ask(stood, true);
    expect(words(html)).toContain(
      'Mark this game as not started? 2 plays and the score, Hawks 2, Bears 3, will be cleared. Why it needs clearing (kept in the log, never shown publicly)',
    );
    expect(html).toContain('<select class="court-input" data-not-started-reason=""');
    expect([...html.matchAll(/<option value="([a-zA-Z]+)"/g)].map((m) => m[1])).toEqual([
      'startedByMistake',
      'onlyTrying',
      'wrongGame',
      'wrongFormat',
      'other',
    ]);
    expect(html).toMatch(
      /<option value="startedByMistake" selected="">Started by mistake<\/option>/,
    );
    expect(answer(html, 'yes')).not.toBeNull();
  });

  it('the league’s refusal stands where the question’s words stood', () => {
    const html = ask(tippedOff(basketball.HALVES), false, {
      problem: t('tracker.notStarted.refused.session-held'),
    });
    expect(html).toContain('role="alert" data-ask-problem=""');
    expect(words(html)).toContain('Someone else has been scoring this game on another device');
  });
});

describe('where the frame draws them (DESIGN.md section 7, line 8)', () => {
  const handlers = new Proxy({}, { get: () => none }) as CourtHandlers;
  const frame = (game: basketball.GameState, asked: PadMode, slots: object, moreOpen = false) => {
    const view = scoringView(game, testRosters, { home: [], away: [] });
    return renderToStaticMarkup(
      createElement(CourtView, {
        t,
        view,
        title: 'Bears at Hawks',
        when: null,
        clock: { text: '0:00', running: false, over: true, start: null },
        banner: { text: 'All saved', short: ['All saved'], state: 'saved' },
        pad: padFor(view, asked),
        said: null,
        moreOpen,
        links: { back: '/b', account: '/a', watch: '/w' },
        on: handlers,
        slots,
      }),
    );
  };
  const padOf = (html: string) =>
    html.slice(
      html.indexOf('<section class="court-pad"'),
      html.indexOf('</section>', html.indexOf('<section class="court-pad"')),
    );

  it('a question is in the pad, in place of everything the pad holds at rest', () => {
    const html = frame(ahead, { kind: 'end', refused: null }, { padPanel: 'THE-QUESTION' });
    expect(html).toContain('data-pad-mode="end"');
    expect(padOf(html)).toContain('THE-QUESTION');
    expect(padOf(html)).not.toContain('data-rest=""');
    expect(padOf(html)).not.toContain('data-pick-period');
    // What the screen says is still in the pad, for a screen reader.
    expect(padOf(html)).toContain('data-say=""');
  });

  it('a final game’s pad holds the final panel whatever was asked for, and nothing of a live game', () => {
    const final = played([{ type: 'end' }], ahead);
    const html = frame(final, { kind: 'player', playerId: 'h5' }, { padPanel: 'THE-FINAL-PANEL' });
    expect(html).toContain('data-pad-mode="final"');
    expect(padOf(html)).toContain('THE-FINAL-PANEL');
    expect(padOf(html)).not.toContain('data-options=');
    expect(padOf(html)).not.toContain('data-rest=""');
  });

  it('End game offered takes the place of the pad’s own first line; with nothing handed in, the way to the next period stays', () => {
    const offered = frame(ahead, { kind: 'rest' }, { padStart: 'END-OFFERED' });
    expect(padOf(offered)).toContain('END-OFFERED');
    expect(padOf(offered)).not.toContain('data-pick-period');
    expect(padOf(frame(ahead, { kind: 'rest' }, { padStart: null }))).toContain('data-pick-period');
  });

  it('behind More, End game comes before everything else', () => {
    const html = frame(
      ahead,
      { kind: 'rest' },
      { moreStart: 'END-FIRST', more: 'AFTER-SWAP' },
      true,
    );
    expect(html.indexOf('END-FIRST')).toBeGreaterThan(-1);
    expect(html.indexOf('END-FIRST')).toBeLessThan(html.indexOf('data-swap-colors'));
    expect(html.indexOf('data-swap-colors')).toBeLessThan(html.indexOf('AFTER-SWAP'));
  });
});
