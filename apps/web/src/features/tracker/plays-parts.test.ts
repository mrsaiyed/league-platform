// The plays' parts of the scoring screen as they are drawn (step 2.37; checklist I1 to
// I5): Undo and Redo naming their play, the latest play's line in the pad, the play log
// over the screen and in its own panel. The game is played on the engine itself and the
// rows are the screen's own (play-log.ts), so what is drawn is what a game gives.
import { createTranslator, en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CourtView, type CourtHandlers } from './court-view.tsx';
import { playLog, redoTarget, undoTarget } from './play-log.ts';
import {
  LatestPlays,
  MoreLog,
  PlayLogPanel,
  PlayLogSheet,
  UndoRedo,
  type PlaysHandlers,
} from './plays-parts.tsx';
import type { KeptTap } from './queue-storage.ts';
import { padAtRest } from './scoring-moves.ts';
import { played, testRosters, tippedOff } from './scoring-test-game.test-helper.ts';
import { scoringView } from './scoring-view.ts';
import { trackerCatalog } from './tracker-catalog.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
const on: PlaysHandlers = {
  undo: () => undefined,
  redo: () => undefined,
  playLog: () => undefined,
};
const basket = (playerId: string, points: 1 | 2 | 3 = 2): basketball.Command => ({
  type: 'score',
  side: playerId.startsWith('h') ? 'home' : 'away',
  playerId,
  points,
});
const waitingTap = (commandId: string): KeptTap =>
  ({ command: { commandId, at: 0, input: { type: 'undo' } }, moment: null }) as KeptTap;

/** A game in play: two baskets and a foul after the lineups, the foul the latest. */
const game = played(
  [basket('h5'), basket('a7', 3), { type: 'foul', side: 'away', playerId: 'a3' }],
  tippedOff(),
);
const latestId = game.plays.at(-1)?.id ?? '';
/** The tag that carries `mark`, whole. */
const tagWith = (html: string, mark: string): string => {
  const at = html.indexOf(mark);
  if (at === -1) throw new Error(`nothing drawn with ${mark}`);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
};
/** What a button draws: from its opening tag to its end. */
const button = (html: string, mark: string): string => {
  const at = html.indexOf(mark);
  if (at === -1) throw new Error(`no button with ${mark}`);
  const from = html.lastIndexOf('<button', at);
  return html.slice(from, html.indexOf('</button>', from));
};
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('Undo and Redo (checklist I1, I3)', () => {
  const drawn = (state: basketball.GameState) =>
    renderToStaticMarkup(
      createElement(UndoRedo, {
        t,
        undo: undoTarget(state, testRosters, t),
        redo: redoTarget(state, testRosters, t),
        on,
      }),
    );

  it('Undo names the play it takes back on the button itself: shortest, in full, and in full for a screen reader', () => {
    const html = drawn(game);
    const undo = button(html, 'data-undo=""');
    expect(tagWith(undo, 'data-undo=""')).toContain('aria-label="Undo Foul on #3 Sol Bearsley"');
    expect(tagWith(undo, 'data-undo=""')).not.toContain('aria-disabled');
    // The word, then the play: what happened first, then the number and first name.
    expect(words(undo)).toBe('Undo Foul #3 Sol Foul on #3 Sol Bearsley');
    expect(undo).toContain('<span class="court-turn-short">Foul #3 Sol</span>');
    expect(undo).toContain('<span class="court-turn-full">Foul on #3 Sol Bearsley</span>');
    // Not a plain word alone: it has a mark of its own, drawn, which no reader is given.
    expect(undo).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('with nothing to bring back Redo is greyed, says so to a screen reader, and is still a button to tap', () => {
    const redo = button(drawn(game), 'data-redo=""');
    const tag = tagWith(redo, 'data-redo=""');
    expect(tag).toContain('aria-disabled="true"');
    expect(tag).toContain('aria-label="Redo: nothing to bring back"');
    // Never the browser's own `disabled`: a tap on it says why (I6).
    expect(tag).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(words(redo)).toBe('Redo');
  });

  it('after an undo, Undo names the play before it and Redo the one it brings back', () => {
    const html = drawn(played([{ type: 'undo' }], game));
    expect(tagWith(html, 'data-undo=""')).toContain('aria-label="Undo #7 Uma Bearsley +3"');
    expect(html).toContain('<span class="court-turn-short">+3 #7 Uma</span>');
    const redo = tagWith(html, 'data-redo=""');
    expect(redo).toContain('aria-label="Redo Foul on #3 Sol Bearsley"');
    expect(redo).not.toContain('aria-disabled');
  });

  it('before the first play, and once the game is final, both are greyed and name nothing', () => {
    for (const state of [
      basketball.newGame(basketball.QUARTERS, 0),
      played([{ type: 'end' }], game),
    ]) {
      const html = drawn(state);
      expect(tagWith(html, 'data-undo=""')).toContain('aria-disabled="true"');
      expect(tagWith(html, 'data-undo=""')).toContain('aria-label="Undo: nothing to take back"');
      expect(tagWith(html, 'data-redo=""')).toContain('aria-disabled="true"');
      expect(html).not.toContain('data-undo-play');
    }
  });
});

describe('the latest play, in the pad at rest (checklist I4, I5)', () => {
  const drawn = (waiting: readonly KeptTap[] = [], open = false) =>
    renderToStaticMarkup(
      createElement(LatestPlays, { t, log: playLog(game, testRosters, waiting, t, 4), open, on }),
    );

  it('is one button that names the latest play with its period and clock, counts the plays and opens the log', () => {
    const html = drawn();
    const opener = button(html, 'data-log-open=""');
    const tag = tagWith(opener, 'data-log-open=""');
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).toContain('aria-expanded="false"');
    expect(tag).toContain('aria-controls="court-play-log"');
    // Its first line is "Latest", the period and clock, and how many plays; under it
    // the play; then what the button does, for a screen reader.
    expect(words(opener)).toBe(
      'Latest Q1 8:00 5 plays Foul on #3 Sol Bearsley Open the play log: 5 plays',
    );
    expect(opener).toContain('<span class="court-latest-play" data-latest-play="">');
    expect(tag).not.toContain('data-unsent');
    // The count for the eye is not read twice.
    expect(tagWith(opener, 'court-latest-count')).toContain('aria-hidden="true"');
    expect(tagWith(drawn([], true), 'data-log-open=""')).toContain('aria-expanded="true"');
  });

  it('says in words when the league does not have the latest play yet, where "Latest" stood', () => {
    const opener = button(drawn([waitingTap(latestId)]), 'data-log-open=""');
    expect(words(opener)).toBe(
      'Not sent yet Q1 8:00 5 plays Foul on #3 Sol Bearsley Open the play log: 5 plays · 1 not sent yet',
    );
    // Marked, so the play is dimmed as well: never by the color alone.
    expect(tagWith(opener, 'data-log-open=""')).toContain('data-unsent=""');
  });

  it('lists the plays before it under it, for where the pad has the room, without reading them twice', () => {
    const html = drawn();
    const before = html.slice(html.indexOf('<ul class="court-latest-before"'));
    expect(tagWith(before, 'court-latest-before')).toContain('aria-hidden="true"');
    expect(before.match(/<li /g)).toHaveLength(3);
    expect(words(before)).toMatch(
      /^Q1 8:00 #7 Uma Bearsley \+3 2–3 Q1 8:00 #5 Ned Hawkins \+2 2–0 /,
    );
  });

  it('draws nothing for a game with no plays', () => {
    const empty = playLog(basketball.newGame(basketball.QUARTERS, 0), testRosters, [], t, 4);
    expect(
      renderToStaticMarkup(createElement(LatestPlays, { t, log: empty, open: false, on })),
    ).toBe('');
  });
});

describe('the play log (checklist I4)', () => {
  it('opened over the screen: a dialog with every play newest first, each with its period, clock and score', () => {
    const html = renderToStaticMarkup(
      createElement(PlayLogSheet, { t, log: playLog(game, testRosters, [], t), on }),
    );
    const sheet = tagWith(html, 'role="dialog"');
    expect(sheet).toContain('id="court-play-log"');
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain('aria-labelledby="court-log-title"');
    expect(words(html.slice(html.indexOf('<h2'), html.indexOf('</h2>')))).toBe('Play log 5 plays');
    expect(html).toContain('aria-label="Close the play log"');
    const rows = html.split('<li ').slice(1);
    expect(rows).toHaveLength(5);
    expect(words(`<li ${rows[0]}`)).toBe('Q1 8:00 Foul on #3 Sol Bearsley');
    expect(words(`<li ${rows[1]}`)).toBe('Q1 8:00 #7 Uma Bearsley +3 2–3');
    expect(words(`<li ${rows[2]}`)).toBe('Q1 8:00 #5 Ned Hawkins +2 2–0');
    expect(words(`<li ${rows[4]}`)).toMatch(/^Q1 8:00 Hawks starters: #3 Max Hawkins, /);
    // The list scrolls inside the sheet, so the keyboard can reach it.
    expect(tagWith(html, 'court-log-rows')).toContain('tabindex="0"');
  });

  it('a play the league does not have yet is marked and says so in words; the title counts them', () => {
    const html = renderToStaticMarkup(
      createElement(PlayLogSheet, {
        t,
        log: playLog(game, testRosters, [waitingTap(latestId)], t),
        on,
      }),
    );
    expect(words(html.slice(html.indexOf('<h2'), html.indexOf('</h2>')))).toBe(
      'Play log 5 plays · 1 not sent yet',
    );
    const rows = html.split('<li ').slice(1);
    expect(rows[0]).toContain('data-unsent=""');
    expect(words(`<li ${rows[0]}`)).toBe('Q1 8:00 Foul on #3 Sol Bearsley Not sent yet');
    expect(rows[1]).not.toContain('data-unsent');
    expect(words(`<li ${rows[1]}`)).not.toContain('Not sent yet');
  });

  it('says so when there are no plays, over the screen and in its panel', () => {
    const empty = playLog(basketball.newGame(basketball.QUARTERS, 0), testRosters, [], t);
    for (const part of [PlayLogSheet, PlayLogPanel]) {
      const html = renderToStaticMarkup(createElement(part, { t, log: empty, on }));
      expect(html).toContain('No plays yet.');
      expect(html).not.toContain('<li');
    }
  });

  it('in its own panel shows the newest plays, counts them all, and leads to the rest', () => {
    const newest = playLog(game, testRosters, [], t, 2);
    const html = renderToStaticMarkup(createElement(PlayLogPanel, { t, log: newest, on }));
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(words(html.slice(html.indexOf('<h2'), html.indexOf('</h2>')))).toBe('Play log 5 plays');
    expect(words(button(html, 'data-log-whole=""'))).toBe('See all 5 plays');
    // With every play on the panel there is nothing more to lead to.
    const all = renderToStaticMarkup(
      createElement(PlayLogPanel, { t, log: playLog(game, testRosters, [], t, 30), on }),
    );
    expect(all).not.toContain('data-log-whole');
  });

  it('is one tap away behind More, with how many plays there are', () => {
    const html = renderToStaticMarkup(
      createElement(MoreLog, { t, log: playLog(game, testRosters, [waitingTap(latestId)], t), on }),
    );
    expect(words(button(html, 'data-more-log=""'))).toBe('Play log');
    expect(words(html)).toBe('Play log 5 plays · 1 not sent yet');
  });
});

describe('where they are on the screen (DESIGN.md section 7, lines 5 and 8)', () => {
  const noop = () => undefined;
  const handlers = new Proxy({}, { get: () => noop }) as CourtHandlers;
  const log = playLog(game, testRosters, [], t, 30);
  const html = renderToStaticMarkup(
    createElement(CourtView, {
      t,
      view: scoringView(game, testRosters, { home: [], away: [] }),
      title: 'Bears at Hawks',
      when: null,
      clock: {
        text: '8:00',
        running: true,
        over: false,
        start: null,
        mode: { now: 'running', lastMinutes: false, lastMinutesAtMs: null, switchable: true },
      },
      banner: { text: 'All saved', short: ['All saved'], state: 'saved' },
      pad: padAtRest,
      said: null,
      moreOpen: true,
      links: { back: '/back', account: '/account', watch: '/watch' },
      on: { ...handlers, leave: () => noop },
      slots: {
        controls: createElement(UndoRedo, {
          t,
          undo: undoTarget(game, testRosters, t),
          redo: redoTarget(game, testRosters, t),
          on,
        }),
        padRest: createElement(LatestPlays, { t, log, open: false, on }),
        playLog: createElement(PlayLogPanel, { t, log, on }),
        more: createElement(MoreLog, { t, log, on }),
      },
    }),
  );

  it('Undo and Redo come after Start or Pause and the timeouts, in the row under the scoreboard', () => {
    const row = html.slice(html.indexOf('data-slot="clock-controls"'));
    const controls = row.slice(0, row.indexOf('</section>'));
    const order = ['data-clock-toggle=""', 'data-timeouts-open=""', 'data-undo=""', 'data-redo=""'];
    const places = order.map((mark) => controls.indexOf(mark));
    expect(places.every((place) => place > 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    // Outside the pad: there whatever the pad shows, a player's options among them.
    expect(html.indexOf('data-undo=""')).toBeLessThan(html.indexOf('data-pad=""'));
  });

  it('the latest play is the pad’s first line at rest, over the hint; the log has its panel and its way behind More', () => {
    const pad = html.slice(html.indexOf('data-pad=""'));
    expect(pad.indexOf('data-latest=""')).toBeGreaterThan(pad.indexOf('data-slot="pad-rest"'));
    expect(pad.indexOf('data-latest=""')).toBeLessThan(pad.indexOf('data-hint=""'));
    const panel = html.slice(html.indexOf('data-slot="play-log"'));
    expect(panel.slice(0, panel.indexOf('</section>'))).toContain('data-log-panel=""');
    const more = html.slice(html.indexOf('data-more=""'));
    expect(more.indexOf('data-more-log=""')).toBeGreaterThan(more.indexOf('data-swap-colors=""'));
  });
});
