// The shared display pieces: what they show, right-to-left names, structure checks for
// accessibility (T-186), and that styling goes only through the design values (T-90).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BoxScoreTable,
  GameCard,
  LiveMarker,
  RoundPicker,
  Scoreboard,
  SeasonPicker,
  SortableStatsTable,
  StandingsTable,
  displayCss,
  nextSort,
  safeColor,
  sortStatRows,
  winnerOf,
  type StatRow,
} from '../index.ts';

const gameLabels = {
  live: 'Live',
  final: 'Final',
  forfeit: 'Forfeit',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
  versus: 'vs',
  winner: 'Winner',
  viewBoxScore: 'View box score',
};
const arabicName = 'نسور الصحراء';
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('Live marker', () => {
  it('says Live in words, with the dot hidden from screen readers', () => {
    const html = render(createElement(LiveMarker, { label: 'Live' }));
    expect(html).toContain('Live');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('game card', () => {
  const base = {
    home: { name: 'Hawks', score: 61, color: '#ff0000' },
    away: { name: arabicName, score: 55 },
    whenText: 'Sat 9:00',
    labels: gameLabels,
  };
  it('marks the winner in words and not only by style', () => {
    const html = render(createElement(GameCard, { ...base, status: 'final' }));
    expect(html).toContain('data-winner="true"');
    expect(html.match(/Winner/g)).toHaveLength(1);
    expect(html).toContain('Final');
    expect(html).toContain('--team-color:#ff0000');
  });
  it('has no winner when level, live or not played', () => {
    expect(winnerOf('final', { name: 'a', score: 5 }, { name: 'b', score: 5 })).toBeNull();
    expect(winnerOf('live', base.home, base.away)).toBeNull();
    expect(winnerOf('final', { name: 'a', score: null }, { name: 'b', score: null })).toBeNull();
    expect(winnerOf('forfeit', base.home, base.away)).toBe('home');
  });
  it('shows the Live marker for a live game and the box score link when given', () => {
    const html = render(
      createElement(GameCard, { ...base, status: 'live', detailsHref: '/x/games/1' }),
    );
    expect(html).toContain('ui-live');
    expect(html).toContain('href="/x/games/1"');
    expect(html).toContain('View box score');
  });
  it('lets each name pick its own direction, so Arabic names read right to left', () => {
    const html = render(createElement(GameCard, { ...base, status: 'scheduled' }));
    expect(html).toContain(`dir="auto">${arabicName}<`);
  });
  it('drops a color that is not #rrggbb', () => {
    expect(safeColor('red; background:url(x)')).toBeUndefined();
    expect(safeColor('#12abEF')).toBe('#12abEF');
    const html = render(
      createElement(GameCard, {
        ...base,
        home: { name: 'A', score: 1, color: 'url(javascript:1)' },
        status: 'final',
      }),
    );
    expect(html).not.toContain('javascript');
  });
});

describe('scoreboard', () => {
  it('is one named region with both scores and the period', () => {
    const html = render(
      createElement(Scoreboard, {
        home: { name: 'Hawks', score: 40 },
        away: { name: arabicName, score: 38 },
        state: 'live',
        periodText: 'Q3 4:12',
        labels: {
          scoreboard: 'Scoreboard',
          home: 'Home',
          away: 'Away',
          live: 'Live',
          final: 'Final',
        },
      }),
    );
    expect(html).toContain('aria-label="Scoreboard"');
    expect(html).toContain('Q3 4:12');
    expect(html).toContain('ui-live');
    expect(html).toContain(`dir="auto">${arabicName}<`);
  });
});

describe('standings table', () => {
  const html = render(
    createElement(StandingsTable, {
      caption: 'Mecca',
      idPrefix: 'mecca',
      columns: [
        { key: 'w', label: 'W' },
        { key: 'l', label: 'L' },
      ],
      rows: [
        { id: 'a', seed: 1, team: arabicName, cells: { w: 5, l: 1 }, notes: ['h2h'] },
        { id: 'b', seed: 2, team: 'Hawks', cells: { w: 4, l: 2 } },
      ],
      footnotes: [{ id: 'h2h', text: 'Ahead on head-to-head' }],
      labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
    }),
  );
  it('is a real table: caption, column and row headings', () => {
    expect(html).toContain('<caption dir="auto">Mecca</caption>');
    expect(html.match(/scope="col"/g)?.length).toBe(4);
    expect(html.match(/scope="row"/g)?.length).toBe(2);
  });
  it('links a note mark to its footnote', () => {
    expect(html).toContain('href="#mecca-note-h2h"');
    expect(html).toContain('id="mecca-note-h2h"');
    expect(html).toContain('Ahead on head-to-head');
  });
  it('shows an Arabic team name with its own direction', () => {
    expect(html).toContain(`<span dir="auto">${arabicName}</span>`);
  });
});

describe('box score table', () => {
  const columns = [
    { key: 'pts', label: 'PTS', fullName: 'Points' },
    { key: 'reb', label: 'REB' },
  ];
  const labels = { jersey: 'No.', player: 'Player', total: 'Total' };
  it('lists players, then totals', () => {
    const html = render(
      createElement(BoxScoreTable, {
        teamName: 'Hawks',
        columns,
        players: [{ id: 'p', jersey: '7', name: arabicName, cells: { pts: 12, reb: 3 } }],
        totals: { pts: 61, reb: 30 },
        labels,
      }),
    );
    expect(html).toContain('<tfoot>');
    expect(html).toContain('61');
    expect(html).toContain(`<span dir="auto">${arabicName}</span>`);
    expect(html).toContain('Points');
  });
  it('shows only the total, with the reason, when the players are hidden', () => {
    const html = render(
      createElement(BoxScoreTable, {
        teamName: 'Hawks',
        columns,
        players: null,
        totals: { pts: 61, reb: 30 },
        hiddenNotice: 'Player numbers are not shown.',
        labels,
      }),
    );
    expect(html).not.toContain('<tbody>');
    expect(html).toContain('Player numbers are not shown.');
    expect(html).toContain('61');
  });
});

describe('sortable statistics table', () => {
  const rows: StatRow[] = [
    { id: '1', cells: { name: 'Bilal', pts: 10, ast: null } },
    { id: '2', cells: { name: arabicName, pts: 25, ast: 2 } },
    { id: '3', cells: { name: 'Adam', pts: 7, ast: 9 } },
  ];
  const ids = (r: StatRow[]) => r.map((x) => x.id);
  it('sorts numbers as numbers and puts missing values last either way', () => {
    expect(ids(sortStatRows(rows, { key: 'pts', direction: 'descending' }))).toEqual([
      '2',
      '1',
      '3',
    ]);
    expect(ids(sortStatRows(rows, { key: 'ast', direction: 'ascending' }))).toEqual([
      '2',
      '3',
      '1',
    ]);
    expect(ids(sortStatRows(rows, { key: 'ast', direction: 'descending' }))).toEqual([
      '3',
      '2',
      '1',
    ]);
  });
  it('sorts names by the language rules and never changes the rows given', () => {
    const copy = [...rows];
    expect(ids(sortStatRows(rows, { key: 'name', direction: 'ascending' }, 'en'))[0]).toBe('3');
    expect(rows).toEqual(copy);
    expect(ids(sortStatRows(rows, null))).toEqual(['1', '2', '3']);
  });
  it('flips on a second press and starts numbers biggest first', () => {
    expect(nextSort(null, 'pts', true)).toEqual({ key: 'pts', direction: 'descending' });
    expect(nextSort(null, 'name', false)).toEqual({ key: 'name', direction: 'ascending' });
    expect(nextSort({ key: 'pts', direction: 'descending' }, 'pts', true).direction).toBe(
      'ascending',
    );
  });
  it('draws the initial sort, with aria-sort on the sorted heading only', () => {
    const html = render(
      createElement(SortableStatsTable, {
        caption: 'Leaders',
        columns: [
          { key: 'name', label: 'Player' },
          { key: 'pts', label: 'PTS', numeric: true },
        ],
        rows,
        initialSort: { key: 'pts', direction: 'descending' },
        labels: { sortBy: 'Sort by' },
      }),
    );
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('aria-sort="none"');
    expect(html.indexOf(arabicName)).toBeLessThan(html.indexOf('Bilal'));
    expect(html).toContain('type="button"');
  });
});

describe('pickers', () => {
  const props = {
    label: 'Round',
    options: [
      { value: '1', label: 'Round 1' },
      { value: '2', label: arabicName },
    ],
    value: '2',
    submitLabel: 'Show',
    keep: { team: 't1', round: 'old' },
  };
  it('is a labelled form that works without scripts and keeps other choices', () => {
    const html = render(createElement(RoundPicker, props));
    expect(html).toContain('method="get"');
    const id = /<select id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain('name="round"');
    expect(html).toContain('name="team" value="t1"');
    expect(html).not.toContain('value="old"');
    expect(html).toContain('type="submit"');
  });
  it('gives two pickers on one page different ids, or the id it is given', () => {
    const page = render(
      createElement(
        'div',
        null,
        createElement(RoundPicker, props),
        createElement(RoundPicker, props),
      ),
    );
    const ids = [...page.matchAll(/<select id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    expect(render(createElement(RoundPicker, { ...props, id: 'mine' }))).toContain('id="mine"');
  });
  it('the season picker asks for season', () => {
    expect(render(createElement(SeasonPicker, props))).toContain('name="season"');
  });
});

describe('review fixes', () => {
  const labels = { jersey: 'No.', player: 'Player', total: 'Total' };
  it('scrollable tables are keyboard reachable named regions', () => {
    const html = render(
      createElement(BoxScoreTable, {
        teamName: 'Hawks',
        regionLabel: 'Hawks box score',
        columns: [{ key: 'pts', label: 'PTS', fullName: 'Points' }],
        players: [],
        totals: { pts: 1 },
        labels,
      }),
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Hawks box score"');
    expect(html).toContain('PTS <span class="ui-visually-hidden">Points</span>');
  });
  it('keeps a space between hidden and visible words', () => {
    const stats = render(
      createElement(SortableStatsTable, {
        caption: 'Leaders',
        columns: [{ key: 'n', label: 'Player' }],
        rows: [],
        labels: { sortBy: 'Sort by' },
      }),
    );
    expect(stats).toContain('Sort by</span> Player');
    const standings = render(
      createElement(StandingsTable, {
        caption: 'D',
        idPrefix: 'd',
        columns: [],
        rows: [{ id: 'a', team: 'A', cells: {}, notes: ['x'] }],
        footnotes: [{ id: 'x', text: 'Why' }],
        labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
      }),
    );
    expect(standings).toContain('Note</span> 1');
  });
  it('the box score link names both teams', () => {
    const html = render(
      createElement(GameCard, {
        home: { name: 'Hawks', score: 1 },
        away: { name: 'Owls', score: 2 },
        status: 'final',
        whenText: 'x',
        detailsHref: '/g',
        labels: gameLabels,
      }),
    );
    expect(html).toMatch(/View box score <span[^>]*>Owls vs Hawks<\/span><\/a>/);
  });
  it('sort arrows are silent and tap targets are big enough', () => {
    expect(displayCss).toContain(String.raw`'\25B2' / ''`);
    expect(displayCss).toContain(String.raw`'\25BC' / ''`);
    expect(displayCss).toMatch(/\.ui-sort-button \{[^}]*min-block-size: 2\.75rem/);
    expect(displayCss).toMatch(/\.ui-note-mark a \{[^}]*min-block-size: 1\.5rem/);
  });
});

describe('the stylesheet', () => {
  const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
  it('holds no color of its own: only the design variables (T-90)', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(|\bhsla?\(/);
    expect(css).not.toMatch(/font-family:(?!\s*var\()/);
  });
  it('uses only logical directions, so right-to-left mirrors (T-188)', () => {
    expect(css).not.toMatch(
      /(^|[\s{;])(margin|padding|border)-(left|right)\b|(^|[\s{;])(left|right)\s*:|text-align:\s*(left|right)|float:/m,
    );
  });
  it('lets readers turn movement off', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});
