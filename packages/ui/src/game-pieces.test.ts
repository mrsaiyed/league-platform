// The pieces of a game's page (step 2.85): the scoreboard in each state a game has, and the
// play-by-play as a table a period (docs/build/DESIGN.md, section 4, lines 6, 7, 10 and 13).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoxScoreTable, GameCard, PlayTable, Scoreboard, displayCss } from '../index.ts';

const arabicName = 'نسور الصحراء';
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const labels = {
  scoreboard: 'Scoreboard',
  home: 'Home',
  away: 'Away',
  live: 'Live',
  final: 'Final',
  winner: 'Winner',
};

describe('the scoreboard of a game page', () => {
  it('gives each team its color chip beside its name', () => {
    const html = render(
      createElement(Scoreboard, {
        home: { name: 'Hawks', score: 61, color: '#2f7fb8' },
        away: { name: arabicName, score: 55, color: 'red;x' },
        state: 'final',
        labels,
      }),
    );
    // Since step 2.147 part 2 a team's mark on the big board is its shield (the emblem
    // piece), in its own color, where a chip of the color used to be.
    expect(html.match(/<svg class="ui-emblem" data-size="large"/g)).toHaveLength(2);
    expect(html).not.toContain('ui-team-chip');
    expect(html).toContain('--team-color:#2f7fb8');
    // Anything that is not a color never reaches the page.
    expect(html).not.toContain('red;x');
    expect(html).toContain(`<span dir="auto">${arabicName}</span>`);
    expect(html).toContain('<span class="ui-game-state">Final</span>');
  });
  it('draws a game still to play with its day and time between the teams, and no score', () => {
    const html = render(
      createElement(Scoreboard, {
        home: { name: 'Hawks', score: null },
        away: { name: 'Owls', score: null },
        state: 'other',
        when: { day: 'Sat, Nov 21', time: '10:00 AM' },
        placeText: 'Central Gym, Court 1',
        noteText: 'This game has not started yet.',
        labels,
      }),
    );
    expect(html).not.toContain('ui-scoreboard-score');
    expect(html).not.toContain('ui-game-state');
    expect(html).toContain('<span class="ui-scoreboard-day">Sat, Nov 21</span>');
    expect(html).toContain('<span class="ui-scoreboard-time">10:00 AM</span>');
    expect(html).toContain('<p class="ui-scoreboard-place" dir="auto">Central Gym, Court 1</p>');
    expect(html).toContain('<p class="ui-scoreboard-note">This game has not started yet.</p>');
  });
  it('says a game not played, or decided off the court, in its pill', () => {
    const postponed = render(
      createElement(Scoreboard, {
        home: { name: 'Hawks', score: null },
        away: { name: 'Owls', score: null },
        state: 'other',
        stateText: 'Postponed',
        labels,
      }),
    );
    expect(postponed).toContain('<span class="ui-game-state">Postponed</span>');
    expect(postponed).not.toContain('ui-scoreboard-when');
    const forfeit = render(
      createElement(Scoreboard, {
        home: { name: 'Hawks', score: 20 },
        away: { name: 'Owls', score: 0 },
        state: 'final',
        stateText: 'Forfeit',
        labels,
      }),
    );
    expect(forfeit).toContain('<span class="ui-game-state">Forfeit</span>');
    expect(forfeit).not.toContain('>Final<');
    expect(forfeit.match(/data-winner="true"/g)).toHaveLength(1);
  });
  it('keeps the Live marker and the clock for a game under way, with its lines at the foot', () => {
    const html = render(
      createElement(
        Scoreboard,
        {
          home: { name: 'Hawks', score: 13 },
          away: { name: 'Owls', score: 10 },
          state: 'live',
          periodText: 'Half 2 15:48',
          stateText: 'Postponed',
          labels,
        },
        createElement('p', null, 'Team fouls this period: Owls 1, Hawks 0'),
      ),
    );
    expect(html).toContain('ui-live');
    expect(html).not.toContain('Postponed');
    expect(html).toContain('<span class="ui-scoreboard-period">Half 2 15:48</span>');
    expect(html).toMatch(/ui-scoreboard-foot"><p>Team fouls this period: Owls 1, Hawks 0<\/p>/);
  });
  it('on a phone gives the state a line of its own above the teams, and each team half the board', () => {
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const wide = css.indexOf('@media (min-width: 40rem) {\n  .ui-scoreboard-teams');
    expect(wide).toBeGreaterThan(-1);
    const phone = css.slice(0, wide);
    // Two equal columns for the teams; what stood between them spans both, on the first line.
    expect(phone).toMatch(
      /\.ui-scoreboard-teams \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/,
    );
    expect(phone).toMatch(/\.ui-scoreboard-middle \{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 1;/);
    expect(phone).toMatch(/\.ui-scoreboard-side \{[^}]*grid-row: 2 \/ span 3;/);
    // From a tablet up it stands between them again.
    const tablet = css.slice(wide);
    expect(tablet).toMatch(
      /\.ui-scoreboard-teams \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/,
    );
    expect(tablet).toMatch(/\.ui-scoreboard-middle \{[^}]*grid-column: 2;/);
    // A long name wraps beside its chip instead of pushing the other team off the board:
    // each team's column is exactly its half, never as wide as its longest word.
    expect(css).toMatch(/\.ui-scoreboard-name > \[dir\] \{[^}]*overflow-wrap: break-word;/);
    expect(phone).toMatch(/\.ui-scoreboard-side \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    // The same for the other pieces that hold a name in a grid of their own.
    for (const piece of [
      '.ui-team-card-text',
      '.ui-leader-who',
      '.ui-page-head',
      '.ui-page-head-text',
    ]) {
      expect(css, piece).toMatch(
        new RegExp(
          `\\n${piece.replace('.', '\\.')} \\{[^}]*grid-template-columns: minmax\\(0, 1fr\\);`,
        ),
      );
    }
  });
  it('marks the winner of a decided game by weight as well as color', () => {
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.ui-scoreboard-name \{[^}]*font-weight: 700;/);
    expect(css).toContain(
      ".ui-scoreboard[data-state='final'] .ui-scoreboard-side:not([data-winner='true']) .ui-scoreboard-name { font-weight: 400; }",
    );
  });
  it('sets scores in lining, even-width figures, the largest thing on the board', () => {
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(
      // Since step 2.147 part 2: the face a design keeps for scores, which always has
      // lining, even-width figures (packages/site, scoreFont), a display size larger.
      /\.ui-scoreboard-score \{[^}]*font-family: var\(--font-score\);[^}]*font-size: var\(--text-48\);[^}]*font-variant-numeric: lining-nums tabular-nums;/,
    );
    expect(css).toMatch(
      /\.ui-game-team-score \{[^}]*font-variant-numeric: lining-nums tabular-nums;/,
    );
    expect(css).toMatch(/\.ui-table \{[^}]*font-variant-numeric: lining-nums tabular-nums;/);
  });
});

describe('the play-by-play table', () => {
  const html = render(
    createElement(PlayTable, {
      title: 'Half 2',
      labels: { time: 'Time', play: 'Play', score: 'Score' },
      rows: [
        {
          key: '3',
          clock: '16:03',
          text: `#5 ${arabicName} scored 3 for Hawks`,
          team: { color: '#2f7fb8' },
          score: { text: '10–13', spoken: 'Lions 10, Hawks 13' },
        },
        { key: '2', clock: '19:12', text: 'Turnover by Lions', team: { color: null } },
        { key: '1', clock: '20:00', text: 'Start of Half 2' },
      ],
    }),
  );
  it('is a real table in the table frame, named by its period, never a numbered list', () => {
    expect(html).toMatch(/^<div class="ui-table-frame"><div class="ui-table-wrap">/);
    expect(html).toContain('<table class="ui-table ui-plays">');
    expect(html).toContain('<caption dir="auto">Half 2</caption>');
    expect(html.match(/scope="col"/g)).toHaveLength(3);
    expect(html).not.toMatch(/<ol|<ul|<li/);
  });
  it('has a clock column, a team mark on a team play only, and the score after a basket', () => {
    expect(html).toContain('<td class="ui-num">16:03</td>');
    // Two plays are a team's: each has its chip, in its own color when it has one.
    expect(html.match(/ui-team-chip/g)).toHaveLength(2);
    expect(html.match(/--team-color/g)).toHaveLength(1);
    expect(html).toContain('<span class="ui-play-mark"></span><span dir="auto">Start of Half 2');
    // The score is drawn short and said in full.
    expect(html.match(/data-scored="true"/g)).toHaveLength(1);
    expect(html).toContain(
      '<span aria-hidden="true">10–13</span><span class="ui-visually-hidden">Lions 10, Hawks 13</span>',
    );
  });
  it('lets the words of a play wrap under themselves, so it never scrolls sideways', () => {
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(
      /\.ui-play \{[^}]*grid-template-columns: var\(--step-3\) minmax\(0, 1fr\);/,
    );
  });
});

describe('a game card in any state', () => {
  const cardLabels = {
    live: 'Live',
    final: 'Final',
    forfeit: 'Forfeit',
    postponed: 'Postponed',
    cancelled: 'Cancelled',
    versus: 'vs',
    winner: 'Winner',
    viewBoxScore: 'View box score',
  };
  it('is one link whose words, written by the page, say what the game is', () => {
    for (const status of ['live', 'scheduled', 'postponed', 'cancelled', 'final'] as const) {
      const html = render(
        createElement(GameCard, {
          home: { name: 'Falcons', score: status === 'live' ? 41 : null },
          away: { name: arabicName, score: status === 'live' ? 38 : null },
          status,
          whenText: 'Sat 9:00',
          detailsHref: '/x/games/1',
          linkText: `${arabicName} against Falcons, ${status}`,
          labels: cardLabels,
        }),
      );
      expect(html.match(/<a /g), status).toHaveLength(1);
      expect(html, status).toContain(
        `<a class="ui-game-link" href="/x/games/1"><span dir="auto">${arabicName} against Falcons, ${status}</span></a>`,
      );
      expect(html, status).not.toContain('View box score');
    }
  });
  // Step 2.153: "Score this game" for one person, never inside the card's link.
  it('draws a second action after the card’s link and outside it, at the foot of the board', () => {
    const card = (action?: ReturnType<typeof createElement>) =>
      render(
        createElement(GameCard, {
          home: { name: 'Falcons', score: null },
          away: { name: 'Herons', score: null },
          status: 'scheduled',
          whenText: 'Sat 9:00',
          placeText: 'Central Gym, Court 1',
          detailsHref: '/x/games/1',
          linkText: 'Herons against Falcons',
          labels: cardLabels,
          layout: 'board',
          ...(action === undefined ? {} : { action }),
        }),
      );
    const button = createElement('a', { className: 'ui-button', href: '/x/score/1' }, 'Score');
    const plain = card();
    const offered = card(button);
    expect(plain).not.toContain('ui-game-action');
    expect(plain).not.toContain('ui-game-end');
    // The card's link closes before the action opens, and the place and the action share
    // the board's third part.
    const link = offered.indexOf('</a>');
    expect(link).toBeGreaterThan(0);
    expect(
      offered.indexOf('<div class="ui-game-end"><footer class="ui-game-foot">'),
    ).toBeGreaterThan(link);
    expect(offered).toContain(
      '<div class="ui-game-action"><a class="ui-button" href="/x/score/1">Score</a></div></div></article>',
    );
    expect(offered.match(/<a /g)).toHaveLength(2);
    // The stylesheet draws it over the card's link.
    expect(displayCss).toMatch(/\.ui-game-action \{\s*position: relative;/);
    // In a list holding a button, every board card's place stands at the start of its foot;
    // the rule reaches no list without one, so a visitor's cards are as they were.
    const footRules = [...displayCss.matchAll(/([^{}]*\.ui-game-foot)\s*\{([^}]*)\}/g)];
    const started = footRules.filter(([, , body]) => /align-self:\s*start/.test(body ?? ''));
    const selectorOf = (text: string | undefined) => (text ?? '').split('*/').at(-1)?.trim();
    expect(started.map(([, selector]) => selectorOf(selector))).toEqual([
      ".ui-card-grid:has(.ui-game-action) .ui-game-card[data-layout='board'] > .ui-game-foot",
    ]);
  });
});

describe('a box score', () => {
  it('draws the number column heading short and keeps the word for screen readers', () => {
    const table = (jerseyShort?: string) =>
      render(
        createElement(BoxScoreTable, {
          teamName: 'Hawks',
          columns: [{ key: 'pts', label: 'PTS', fullName: 'Points' }],
          players: [{ id: 'p', jersey: '7', name: 'Max', cells: { pts: 5 } }],
          totals: { pts: 5 },
          labels: { jersey: 'Number', jerseyShort, player: 'Player', total: 'Total' },
        }),
      );
    expect(table('#')).toContain(
      '<th scope="col" class="ui-num" title="Number"><span aria-hidden="true">#</span><span class="ui-visually-hidden">Number</span></th>',
    );
    expect(table()).toContain('<th scope="col" class="ui-num">Number</th>');
  });
});
