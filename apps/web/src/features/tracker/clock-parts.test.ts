// The clock's parts as they are drawn (step 2.36's done test: a component test for each
// control). Each is drawn for a game the engine itself played, and what is drawn is read
// back: the words (from the message files), the shape, the name a screen reader says,
// and what is greyed. The taps themselves are made in a real browser
// (tests/browser/scoring-screen-test.mjs).
import { createTranslator, en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ClockButton,
  ClockControls,
  ClockSheetView,
  StartBar,
  TeamFouls,
  TimeoutsChip,
  TimeoutsPad,
  teamBoardLabel,
  timeoutRuleText,
  type ClockHandlers,
  type ClockSheet,
  type CourtClock,
} from './clock-parts.tsx';
import { clockEntry, periodChoices } from './game-clock.ts';
import { noLineupPicks } from './opened-game-storage.ts';
import { played, testRosters, tippedOff } from './scoring-test-game.test-helper.ts';
import { scoringView } from './scoring-view.ts';
import { trackerCatalog } from './tracker-catalog.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
const draw = (element: ReactElement): string => renderToStaticMarkup(element);
/** The words of what was drawn, as they read. */
const words = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
/** The opening tag of the first element drawn with `attribute`. */
const tag = (html: string, attribute: string): string => {
  const found = new RegExp(`<[a-z0-9]+ [^>]*${attribute}[^>]*>`).exec(html);
  if (found === null) throw new Error(`nothing drawn with ${attribute}`);
  return found[0];
};

const on: ClockHandlers & { readonly closePad: () => void } = {
  startClock: () => undefined,
  pauseClock: () => undefined,
  periodOver: () => undefined,
  hideStart: () => undefined,
  clockSheet: () => undefined,
  clockKey: () => undefined,
  setClock: () => undefined,
  pickPeriod: () => undefined,
  timeouts: () => undefined,
  callTimeout: () => undefined,
  answerTimeout: () => undefined,
  takeBackTimeout: () => undefined,
  closePad: () => undefined,
};

const viewOf = (game: basketball.GameState) => scoringView(game, testRosters, noLineupPicks);
const stopped: CourtClock = { text: '7:30', running: false, over: false, start: null };
const running: CourtClock = { ...stopped, running: true };
const over: CourtClock = { text: '0:00', running: false, over: true, start: null };
const fouls = (side: 'home' | 'away', playerId: string, count: number): basketball.Command[] =>
  Array.from({ length: count }, () => ({ type: 'foul', side, playerId }) as const);
const final = () =>
  played(
    [{ type: 'score', side: 'home', playerId: 'h3', points: 2 }, { type: 'end' }],
    tippedOff(),
  );

describe('Start and Pause (T2)', () => {
  const controls = (clock: CourtClock, game = tippedOff()) =>
    draw(
      createElement(ClockControls, {
        t,
        view: viewOf(game),
        clock,
        timeoutsOpen: false,
        padId: 'court-pad',
        on,
      }),
    );

  it('differ in word and in shape, never only in color', () => {
    const start = controls(stopped);
    const pause = controls(running);
    expect(tag(start, 'data-clock-toggle')).toContain('data-state="start"');
    expect(tag(start, 'data-clock-toggle')).toContain('aria-label="Start the clock"');
    expect(start).toContain('class="court-mark-start"');
    expect(start).toContain('>Start<');
    expect(tag(pause, 'data-clock-toggle')).toContain('data-state="pause"');
    expect(tag(pause, 'data-clock-toggle')).toContain('aria-label="Pause the clock"');
    expect(pause).toContain('class="court-mark-pause"');
    expect(pause).toContain('>Pause<');
    expect(pause).not.toContain('court-mark-start');
  });

  it('at 0:00 is greyed and says why in words, and can still be tapped to be told', () => {
    const html = controls(over);
    const button = tag(html, 'data-clock-toggle');
    expect(button).toContain('data-state="over"');
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain('aria-label="Period over: pick the next period"');
    // Not `disabled`: a tap says "This period is over. Pick the next period first."
    expect(button).not.toMatch(/\sdisabled=""/);
    expect(html).toContain('>Period over<');
  });

  it('is beside the one way to both teams’ timeouts; a final game greys both', () => {
    const html = controls(stopped);
    expect(tag(html, 'data-timeouts-open')).toContain('aria-controls="court-pad"');
    expect(tag(html, 'data-timeouts-open')).toContain('aria-expanded="false"');
    expect(words(html)).toBe('Start Timeouts');
    const done = controls(stopped, final());
    expect(tag(done, 'data-clock-toggle')).toMatch(/\sdisabled=""/);
    expect(tag(done, 'data-timeouts-open')).toMatch(/\sdisabled=""/);
  });
});

describe('the clock in the scoreboard (T3, T5, T6)', () => {
  const button = (clock: CourtClock, game = tippedOff()) =>
    draw(createElement(ClockButton, { t, view: viewOf(game), clock, open: false, on }));

  it('shows the time and the period, and is the button that sets both', () => {
    const html = button(stopped);
    expect(tag(html, 'data-clock=""')).toContain('aria-haspopup="dialog"');
    expect(tag(html, 'data-clock=""')).toContain('aria-controls="court-clock-sheet"');
    // What a screen reader says: the time, the period, what the button does.
    expect(words(html)).toBe('7:30 Q1 Set the clock or change the period');
    expect(html).toContain('data-clock-time="">7:30<');
    expect(html).not.toContain('data-zero');
  });

  it('is marked at 0:00, names overtime, and is greyed on a final game', () => {
    expect(tag(button(over), 'data-clock=""')).toContain('data-zero=""');
    const overtime = played([{ type: 'period', period: 5 }], tippedOff());
    expect(words(button(stopped, overtime))).toContain('OT1');
    const halves = played([{ type: 'period', period: 2 }], tippedOff(basketball.HALVES));
    expect(words(button(stopped, halves))).toContain('H2');
    expect(tag(button(stopped, final()), 'data-clock=""')).toMatch(/\sdisabled=""/);
  });
});

describe('team fouls and the bonus, in each team’s box (F1 to F3)', () => {
  /**
   * A team's line as drawn: `html` in the words every size but a narrow one shows, and
   * `short`, the count as a narrow box writes it beside a badge ("10F"), or null.
   */
  const box = (game: basketball.GameState, side: 'home' | 'away') => {
    const team = viewOf(game).teams[side];
    const drawn = draw(createElement(TeamFouls, { t, team }));
    const short = /<span class="court-fouls-short">([^<]*)<\/span>/.exec(drawn);
    return {
      html: short === null ? drawn : drawn.replace(short[0], ''),
      short: short?.[1] ?? null,
      label: teamBoardLabel(team, t),
    };
  };
  const halves = () => tippedOff(basketball.HALVES);

  it('always shows the count, so nothing moves at the first foul', () => {
    const none = box(halves(), 'home');
    expect(words(none.html)).toBe('0 fouls');
    expect(tag(none.html, 'data-team-fouls="home"')).toContain('data-level="0"');
    expect(none.label).toBe('Hawks: 0, 0 team fouls this period');
    const one = box(played(fouls('home', 'h3', 1), halves()), 'home');
    expect(words(one.html)).toBe('1 foul');
    expect(one.label).toBe('Hawks: 0, 1 team foul this period');
  });

  it('grows at the bonus and the double bonus, and badges the team that shoots it', () => {
    const seven = played(fouls('home', 'h3', 7), halves());
    expect(tag(box(seven, 'home').html, 'data-team-fouls="home"')).toContain('data-level="1"');
    expect(box(seven, 'home').html).not.toContain('data-bonus');
    const shooting = box(seven, 'away');
    expect(words(shooting.html)).toBe('0 fouls Bonus');
    expect(tag(shooting.html, 'data-bonus="away"')).toContain('data-level="1"');
    expect(shooting.label).toBe('Bears: 0, 0 team fouls this period, shooting the Bonus');

    const ten = played(fouls('home', 'h5', 3), seven);
    expect(tag(box(ten, 'home').html, 'data-team-fouls="home"')).toContain('data-level="2"');
    expect(words(box(ten, 'away').html)).toBe('0 fouls Double bonus');
    expect(tag(box(ten, 'away').html, 'data-bonus="away"')).toContain('data-level="2"');
  });

  it('shows both at once when both teams are over the limit', () => {
    const both = played([...fouls('home', 'h3', 10), ...fouls('away', 'a3', 7)], halves());
    expect(words(box(both, 'home').html)).toBe('10 fouls Bonus');
    expect(words(box(both, 'away').html)).toBe('7 fouls Double bonus');
    // Beside a badge a narrow box writes the count as the tiles do; with none, in words only.
    expect(box(both, 'home').short).toBe('10F');
    expect(box(both, 'away').short).toBe('7F');
    expect(box(halves(), 'home').short).toBeNull();
    expect(
      tag(
        draw(createElement(TeamFouls, { t, team: viewOf(both).teams.home })),
        'class="court-score-fouls"',
      ),
    ).toContain('data-badge=""');
  });
});

describe('the large Start clock button (T7 to T10)', () => {
  const bar = (clock: CourtClock, game = tippedOff()) =>
    draw(createElement(StartBar, { t, view: viewOf(game), clock, on }));
  const offered = (why: string, tipOff = false): CourtClock => ({
    ...stopped,
    start: { tipOff, why },
  });

  it('says the period and the time, why the clock is stopped, and how to hide it', () => {
    const html = bar(offered('Stopped for a foul on #3 Max Hawkins.'));
    expect(tag(html, 'data-start-clock')).toContain('aria-describedby="court-start-why"');
    expect(html).toContain('class="court-mark-start"');
    expect(words(html)).toBe(
      'Start clock Q1 · 7:30 Stopped for a foul on #3 Max Hawkins. Scoring and substitutions still work. × hides this button.',
    );
    expect(tag(html, 'data-hide-start')).toContain('aria-label="Hide the Start clock button"');
  });

  it('before the game reads "Start clock · tip-off"', () => {
    expect(words(bar(offered('Start it at the tip.', true)))).toContain(
      'Start clock · tip-off Q1 · 7:30 Start it at the tip.',
    );
  });

  it('is not drawn while it is not offered, or on a final game', () => {
    expect(bar(stopped)).toBe('');
    expect(bar(running)).toBe('');
    expect(bar(offered('The clock is stopped.'), final())).toBe('');
  });

  it('at 0:00 the same place holds the way to the next period, and says which ended', () => {
    const first = bar(over);
    expect(first).not.toContain('data-start-clock');
    expect(tag(first, 'data-pick-period')).toContain('data-kind="next"');
    expect(words(first)).toBe(
      'Pick the next period End of Q1. The clock starts again in the next period.',
    );
    const half = bar(over, played([{ type: 'period', period: 2 }], tippedOff()));
    expect(words(half)).toContain('Halftime. The clock starts again in the next period.');
    const halves = bar(over, tippedOff(basketball.HALVES));
    expect(words(halves)).toContain('Halftime.');
  });
});

describe('timeouts (G3 to G7)', () => {
  const call = (side: 'home' | 'away', seconds: 60 | 30): basketball.Command => ({
    type: 'timeout',
    side,
    seconds,
  });
  const padOf = (
    game: basketball.GameState,
    asking: { side: 'home' | 'away'; seconds: 60 | 30 } | null = null,
  ) => draw(createElement(TimeoutsPad, { t, view: viewOf(game), asking, on }));
  const teamOf = (html: string, side: 'home' | 'away') => {
    const from = html.indexOf(`data-timeouts-of="${side}"`);
    return html.slice(from, html.indexOf('</section>', from));
  };

  it('offers a button for each length saying how many are left, and the rule in one line', () => {
    const html = padOf(tippedOff());
    expect(words(teamOf(html, 'home'))).toContain('Hawks Full 3 left 30-second 2 left None taken.');
    expect(tag(teamOf(html, 'away'), 'data-seconds="60"')).toContain(
      'aria-label="Full timeout for Bears, 3 left"',
    );
    expect(tag(teamOf(html, 'away'), 'data-seconds="30"')).toContain(
      'aria-label="30-second timeout for Bears, 2 left"',
    );
    expect(tag(html, 'data-timeout-rule')).toContain('class="court-timeout-rule"');
    expect(words(html)).toContain(
      'Timeouts 3 full and 2 30-second a game · 1 more each overtime · none carried over',
    );
  });

  it('leaves out the 30-second button where the format has none', () => {
    const html = padOf(tippedOff(basketball.HALVES));
    expect(html).not.toContain('data-seconds="30"');
    expect(words(teamOf(html, 'home'))).toContain('Hawks Full 2 left None taken.');
  });

  it('lists those taken with period and clock time, the latest first, and − for the latest', () => {
    const started = played([{ type: 'start' }], tippedOff());
    const first = basketball.apply(started, call('home', 60), {
      id: 'first',
      now: started.lastAt + 30_000,
    });
    const game = played([{ type: 'period', period: 2 }, call('home', 30)], first);
    const home = teamOf(padOf(game), 'home');
    expect(words(home)).toContain(
      'Full 2 left 30-second 1 left Q2 8:00 · 30-second Q1 7:30 · Full',
    );
    expect(tag(home, 'data-act="untimeout"')).toContain(
      'aria-label="Take back the latest Hawks timeout"',
    );
    // The other team has taken none: nothing to take back.
    expect(teamOf(padOf(game), 'away')).not.toContain('data-act="untimeout"');
  });

  it('says "none left" for a length that is used up, and marks the button', () => {
    const game = played([call('home', 30), call('home', 30)], tippedOff());
    const home = teamOf(padOf(game), 'home');
    expect(tag(home, 'data-seconds="30"')).toContain('data-none=""');
    expect(tag(home, 'data-seconds="30"')).toContain(
      'aria-label="30-second timeout for Hawks, none left"',
    );
    expect(tag(home, 'data-seconds="60"')).not.toContain('data-none');
  });

  it('asks before recording one more than a team has, with both answers', () => {
    const html = padOf(tippedOff(), { side: 'away', seconds: 60 });
    expect(html).not.toContain('data-act="timeout"');
    expect(words(html)).toContain(
      'No full timeouts left for Bears. Officials charge a technical foul for an extra one. Record it anyway? Do not record it Record it anyway',
    );
    expect(words(padOf(tippedOff(), { side: 'home', seconds: 30 }))).toContain(
      'No 30-second timeouts left for Hawks.',
    );
    expect(tag(html, 'data-answer="yes"')).toContain('aria-describedby="court-timeout-question"');
  });

  it('words the rule for every format', () => {
    const rule = (rules: Partial<basketball.TimeoutRules>) =>
      timeoutRuleText({ ...basketball.timeoutRules(basketball.QUARTERS), ...rules }, t);
    expect(rule({ shortTimeouts: 0, timeoutsPer: 'half' })).toBe(
      '3 full a half · 1 more each overtime · none carried over',
    );
    expect(rule({ fullTimeouts: 0, overtimeTimeouts: 0, timeoutsCarry: true })).toBe(
      '2 30-second a game · none in overtime · unused carry over',
    );
    expect(rule({ fullTimeouts: 0, shortTimeouts: 0 })).toContain('None a game');
    expect(rule({ timeoutsPer: 'half' })).toContain('3 full and 2 30-second a half');
  });

  it('a team’s chip says how many it has left, or that it has none', () => {
    const chip = (game: basketball.GameState) =>
      draw(
        createElement(TimeoutsChip, {
          t,
          team: viewOf(game).teams.home,
          open: false,
          padId: 'court-pad',
          disabled: false,
          on,
        }),
      );
    // Written short, as the bench's chip is; a screen reader is told in full.
    expect(words(chip(tippedOff()))).toBe('Timeouts 5');
    expect(tag(chip(tippedOff()), 'data-timeouts-chip')).toContain(
      'aria-label="Hawks: 5 timeouts left"',
    );
    const none = played([call('home', 60), call('home', 60)], tippedOff(basketball.HALVES));
    const one = chip(played([{ type: 'untimeout', side: 'home' }], none));
    expect(words(one)).toBe('Timeouts 1');
    expect(tag(one, 'data-timeouts-chip')).toContain('aria-label="Hawks: 1 timeout left"');
    expect(words(chip(none))).toBe('Timeouts 0');
    expect(tag(chip(none), 'data-timeouts-chip')).toContain('data-none=""');
    expect(tag(chip(none), 'data-timeouts-chip')).toContain('aria-label="Hawks: no timeouts left"');
  });
});

describe('the form that sets the clock and picks the period (T5, T6)', () => {
  const sheetOf = (digits: string, putsBack: string | null = null, period = 1): ClockSheet => ({
    entry: clockEntry(digits),
    putsBack,
    periods: periodChoices(basketball.QUARTERS, period),
  });
  const form = (sheet: ClockSheet, clock: CourtClock = stopped, game = tippedOff()) =>
    draw(createElement(ClockSheetView, { t, view: viewOf(game), clock, sheet, on }));

  it('is a dialog with twelve large keys, and shows the clock until a time is typed', () => {
    const html = form(sheetOf(''));
    expect(tag(html, 'role="dialog"')).toContain('aria-modal="true"');
    expect(html.match(/data-key="/g)).toHaveLength(12);
    expect(tag(html, 'data-key="back"')).toContain('aria-label="Delete the last digit"');
    expect(html).toContain('data-clock-entry="" aria-live="polite">7:30<');
    expect(tag(html, 'data-set-clock')).toMatch(/\sdisabled=""/);
    expect(words(html)).toContain('Type the time left: 6, 3, 0 is 6:30.');
  });

  it('shows what is typed and names what Set will do', () => {
    const html = form(sheetOf('630'));
    expect(tag(html, 'data-clock-entry')).toContain('data-typed=""');
    expect(html).toContain('>6:30</output>');
    expect(tag(html, 'data-set-clock')).not.toMatch(/\sdisabled=""/);
    expect(words(html)).toContain('Set clock to 6:30');
  });

  it('says so before time goes back on the clock, and that setting a running clock stops it', () => {
    expect(words(form(sheetOf('800', '0:30')))).toContain(
      'This puts 0:30 back on, and takes it off the minutes of the players on the court.',
    );
    expect(words(form(sheetOf(''), running))).toContain('Setting the clock stops it.');
  });

  it('says what is wrong with a time the clock does not take, and does not set it', () => {
    const seconds = form(sheetOf('75'));
    expect(words(seconds)).toContain('Seconds go up to 59.');
    expect(tag(seconds, 'data-clock-entry')).toContain('data-problem=""');
    expect(tag(seconds, 'data-set-clock')).toMatch(/\sdisabled=""/);
    expect(words(form(sheetOf('6001')))).toContain('The clock goes up to 60:00.');
  });

  it('offers every period and three overtimes, the one being played marked and the next one too', () => {
    const html = form(
      sheetOf('', null, 2),
      stopped,
      played([{ type: 'period', period: 2 }], tippedOff()),
    );
    const periods = html.slice(html.indexOf('data-periods=""'), html.indexOf('court-clock-help'));
    expect(words(periods)).toContain('Q1 Q2 now Q3 next Q4 OT1 OT2 OT3');
    expect(tag(periods, 'data-period-pick="2"')).toContain('aria-pressed="true"');
    expect(tag(periods, 'data-period-pick="2"')).toMatch(/\sdisabled=""/);
    expect(tag(periods, 'data-period-pick="2"')).toContain(
      'aria-label="Q2, the period being played"',
    );
    // The next period is marked; once the clock has run out it is the next step.
    expect(tag(periods, 'data-period-pick="3"')).toContain('data-next="later"');
    expect(tag(form(sheetOf(''), over), 'data-period-pick="2"')).toContain('data-next="due"');
    expect(tag(periods, 'data-period-pick="5"')).toContain('aria-label="Go to OT1"');
  });
});
