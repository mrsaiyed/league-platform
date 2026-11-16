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
  clockSetSaid,
  latestTimeouts,
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
    expect(words(html)).toBe('Start Timeouts 5 5');
    const done = controls(stopped, final());
    expect(tag(done, 'data-clock-toggle')).toMatch(/\sdisabled=""/);
    expect(tag(done, 'data-timeouts-open')).toMatch(/\sdisabled=""/);
  });

  it('the way to the timeouts carries both teams’ numbers left, home first, and marks a team with none', () => {
    // Two full a half in this format: the home team takes one, then its second.
    const call: basketball.Command = { type: 'timeout', side: 'home', seconds: 60 };
    const one = controls(stopped, played([call], tippedOff(basketball.HALVES)));
    expect(words(one)).toBe('Start Timeouts 1 2');
    expect(one.indexOf('data-timeouts-left="home"')).toBeLessThan(
      one.indexOf('data-timeouts-left="away"'),
    );
    // A screen reader is told both in full, and nothing of the short form twice.
    expect(tag(one, 'data-timeouts-open')).toContain(
      'aria-label="Timeouts: Hawks 1 left, Bears 2 left"',
    );
    expect(tag(one, 'class="court-timeouts-left"')).toContain('aria-hidden="true"');
    expect(one).not.toContain('data-none');
    const none = controls(stopped, played([call, call], tippedOff(basketball.HALVES)));
    expect(words(none)).toBe('Start Timeouts 0 2');
    expect(tag(none, 'data-timeouts-left="home"')).toContain('data-none=""');
    expect(tag(none, 'data-timeouts-left="away"')).not.toContain('data-none');
    expect(tag(none, 'data-timeouts-open')).toContain(
      'aria-label="Timeouts: Hawks none left, Bears 2 left"',
    );
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
    // Both words are drawn, in the place where they wrap for want of room (a narrow box
    // in wide letters shows the first); the box's own name says both to a screen reader.
    expect(box(ten, 'away').html).toContain('<span class="court-bonus-words">Double bonus</span>');
    expect(box(ten, 'away').label).toBe(
      'Bears: 0, 0 team fouls this period, shooting the Double bonus',
    );
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
    // Two lengths in this format: each entry says which, and has the width to itself.
    expect(tag(home, 'class="court-timeout-taken"')).toContain('data-lengths=""');
  });

  it('writes out the latest two and counts the rest, so the list never scrolls (M1)', () => {
    // Six for each team in a league with one length of timeout: two a half, one in
    // overtime, and one more than allowed in each.
    const six = (side: 'home' | 'away'): basketball.Command[] => [
      call(side, 60),
      call(side, 60),
      call(side, 60),
    ];
    const game = played(
      [
        ...six('home'),
        ...six('away'),
        { type: 'period', period: 2 },
        ...six('home'),
        ...six('away'),
      ],
      tippedOff(basketball.HALVES),
    );
    for (const side of ['home', 'away'] as const) {
      const team = teamOf(padOf(game), side);
      expect(padOf(game)).toContain(`data-timeouts-of="${side}" data-taken-count="6"`);
      // The latest two whole, with no "Full" where every timeout is one: then a count.
      expect(team.match(/<li>/g)).toHaveLength(2);
      expect(words(team)).toContain('none left H2 20:00 H2 20:00 and 4 earlier');
      expect(words(team)).not.toMatch(/· Full/);
      expect(tag(team, 'class="court-timeout-taken"')).not.toContain('data-lengths');
    }
    // Three taken: the latest two and "and 1 earlier"; two taken: both, and no count.
    const three = teamOf(padOf(played(six('home'), tippedOff(basketball.HALVES))), 'home');
    expect(words(three)).toContain('H1 20:00 H1 20:00 and 1 earlier');
    const two = teamOf(padOf(played(six('home').slice(1), tippedOff(basketball.HALVES))), 'home');
    expect(two.match(/<li>/g)).toHaveLength(2);
    expect(two).not.toContain('data-timeouts-earlier');
  });

  it('the latest is first: it is the one − takes back', () => {
    const taken = [1, 2, 3, 4].map((n) => ({
      id: `t${n}`,
      period: 1,
      clockMs: n * 60_000,
      seconds: 60 as const,
    }));
    expect(latestTimeouts(taken)).toEqual({ written: [taken[3], taken[2]], earlier: 2 });
    expect(latestTimeouts(taken.slice(0, 1))).toEqual({ written: [taken[0]], earlier: 0 });
    expect(latestTimeouts([])).toEqual({ written: [], earlier: 0 });
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
  const sheetOf = (
    digits: string,
    effect: ClockSheet['effect'] = null,
    period = 1,
  ): ClockSheet => ({
    entry: clockEntry(digits, basketball.periodMs(basketball.QUARTERS, period)),
    effect,
    periodLength: basketball.formatClock(basketball.periodMs(basketball.QUARTERS, period)),
    periods: periodChoices(basketball.QUARTERS, period),
  });
  const form = (sheet: ClockSheet, clock: CourtClock = stopped, game = tippedOff()) =>
    draw(createElement(ClockSheetView, { t, view: viewOf(game), clock, sheet, on }));

  it('is a dialog with twelve large keys, and shows the clock until a time is typed', () => {
    const html = form(sheetOf(''));
    expect(tag(html, 'role="dialog"')).toContain('aria-modal="true"');
    expect(html.match(/data-key="/g)).toHaveLength(12);
    expect(tag(html, 'data-key="back"')).toContain('aria-label="Delete the last digit"');
    // The clock as it reads now, in the place the ticker writes while it runs; a ticking
    // clock is not read out second by second.
    expect(html).toContain('data-clock-entry="" data-clock-now="" aria-live="off">7:30<');
    expect(tag(html, 'data-set-clock')).toMatch(/\sdisabled=""/);
    expect(words(html)).toContain('Type the time left: 6, 3, 0 is 6:30.');
  });

  it('shows what is typed and names what Set will do', () => {
    const html = form(sheetOf('630'));
    expect(tag(html, 'data-clock-entry')).toContain('data-typed=""');
    // What is typed is announced, and the ticker leaves it alone.
    expect(tag(html, 'data-clock-entry')).toContain('aria-live="polite"');
    expect(tag(html, 'data-clock-entry')).not.toContain('data-clock-now');
    expect(html).toContain('>6:30</output>');
    expect(tag(html, 'data-set-clock')).not.toMatch(/\sdisabled=""/);
    expect(words(html)).toContain('Set clock to 6:30');
  });

  it('says what comes off the minutes before time goes back on the clock, and that setting a running clock stops it', () => {
    expect(
      words(form(sheetOf('800', { kind: 'back', time: '0:30', wholePeriod: false }))),
    ).toContain('This takes 0:30 off the minutes of the players on the court.');
    // All the period has run comes off: the form says so (the area 4 review, M4).
    expect(
      words(form(sheetOf('800', { kind: 'back', time: '3:05', wholePeriod: true }))),
    ).toContain('This takes 3:05 off the players’ minutes: all they have played this period.');
    expect(words(form(sheetOf(''), running))).toContain('Setting the clock stops it.');
  });

  it('says what is added when time comes off the clock, and where a period not yet run starts (S-71)', () => {
    expect(words(form(sheetOf('500', { kind: 'added', time: '2:30' })))).toContain(
      'This adds 2:30 to the minutes of the players on the court.',
    );
    expect(words(form(sheetOf('700', { kind: 'start', clock: '7:00' })))).toContain(
      'The period will start at 7:00. Nobody’s minutes change.',
    );
  });

  it('says once set what truly came off or was added, in one line too, or only the time', () => {
    expect(clockSetSaid(t, '12:00', { kind: 'added', time: '4:55', even: true })).toEqual({
      text: 'Clock set to 12:00. 4:55 was added to the minutes of the players on the court.',
      short: 'Clock 12:00 · 4:55 added',
    });
    expect(clockSetSaid(t, '16:55', { kind: 'back', time: '4:55', even: true })).toEqual({
      text: 'Clock set to 16:55. 4:55 came off the minutes of the players on the court.',
      short: 'Clock 16:55 · 4:55 off',
    });
    // A player moved by less than the figure: the short form promises no amount.
    expect(clockSetSaid(t, '8:00', { kind: 'back', time: '1:30', even: false })).toEqual({
      text: 'Clock set to 8:00. 1:30 came off the minutes of the players on the court.',
      short: 'Clock set to 8:00.',
    });
    expect(clockSetSaid(t, '7:00', null)).toBe('Clock set to 7:00.');
  });

  it('says what is wrong with a time the clock does not take, and does not set it', () => {
    const seconds = form(sheetOf('75'));
    expect(words(seconds)).toContain('Seconds go up to 59.');
    expect(tag(seconds, 'data-clock-entry')).toContain('data-problem=""');
    expect(tag(seconds, 'data-set-clock')).toMatch(/\sdisabled=""/);
    expect(words(form(sheetOf('6001')))).toContain('The clock goes up to 60:00.');
    // Longer than the period being played: refused in words, and Set is not offered.
    const long = form(sheetOf('900'));
    expect(words(long)).toContain('Q1 is 8:00 long: type 8:00 or less.');
    expect(tag(long, 'data-clock-entry')).toContain('data-problem=""');
    expect(tag(long, 'data-set-clock')).toMatch(/\sdisabled=""/);
    expect(words(long)).toContain('Set clock');
    expect(words(long)).not.toContain('Set clock to');
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
