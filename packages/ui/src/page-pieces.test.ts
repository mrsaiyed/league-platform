// The pieces a page is laid out with (step 2.85): what each shows, that names in any script
// keep their own direction (T-188), and that the stylesheet covers the things the look
// depends on (docs/build/DESIGN.md, section 4).
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BoxScoreTable,
  Emblem,
  EmptyPanel,
  FilterToolbar,
  GameCard,
  Group,
  LeaderCard,
  MessagePage,
  NoValue,
  PageHead,
  RoundPicker,
  Section,
  SortableStatsTable,
  StandingsTable,
  StatStrip,
  TeamCard,
  appliesAtOnce,
  displayCss,
  initialOf,
  stripAcross,
} from '../index.ts';

const arabicName = 'نسور الصحراء';
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('page head', () => {
  it('has one title, with a small label above it and a quiet line under it', () => {
    const html = render(
      createElement(PageHead, { title: 'Schedule', eyebrow: 'Fall 2026', sub: 'Every game' }),
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<p class="ui-eyebrow">Fall 2026</p>');
    expect(html.indexOf('Fall 2026')).toBeLessThan(html.indexOf('Schedule'));
    expect(html).toContain('Every game');
  });
  it('opens a home page larger, with the label as a badge', () => {
    const html = render(
      createElement(PageHead, { title: arabicName, eyebrow: 'Fall 2026', size: 'hero' }),
    );
    expect(html).toContain('data-size="hero"');
    expect(html).toContain('ui-badge');
    expect(html).toContain(`<h1 dir="auto">${arabicName}</h1>`);
  });
  it('lists a few facts under the title, each a label and its value', () => {
    const html = render(
      createElement(PageHead, {
        title: 'Owls',
        facts: [
          { key: 'seed', label: 'Seed', value: '1' },
          { key: 'record', label: 'Record', value: '5-1' },
        ],
      }),
    );
    expect(html).toContain('<dl class="ui-facts">');
    expect(html).toContain('<dt>Seed</dt><dd dir="auto">1</dd>');
    expect(html).toContain('<dt>Record</dt><dd dir="auto">5-1</dd>');
    expect(html.indexOf('Owls')).toBeLessThan(html.indexOf('ui-facts'));
    expect(render(createElement(PageHead, { title: 'Owls', facts: [] }))).not.toContain('ui-facts');
  });
});

describe('section', () => {
  it('has a level-two title and, when given, one way on beside it', () => {
    const html = render(
      createElement(Section, {
        title: 'Standings',
        more: { href: '/x/standings', label: 'See the full standings' },
        children: 'body',
      }),
    );
    expect(html).toContain('<h2>Standings</h2>');
    expect(html).toContain('<a class="ui-more" href="/x/standings">See the full standings</a>');
    expect(render(createElement(Section, { title: 'A', children: 'b' }))).not.toContain('<a');
  });
});

describe('empty panel', () => {
  it('says what will appear and offers what to do next when there is something', () => {
    const html = render(
      createElement(EmptyPanel, {
        text: 'The standings appear here once games have been played.',
        action: { href: '/x/schedule', label: 'See the schedule' },
      }),
    );
    expect(html).toContain('The standings appear here once games have been played.');
    expect(html).toContain('href="/x/schedule"');
    expect(render(createElement(EmptyPanel, { text: 'Later.' }))).not.toContain('<a');
  });
});

describe('message page', () => {
  it('is the main area, with one title and one clear way on', () => {
    const html = render(
      createElement(
        MessagePage,
        { title: 'Page not found', action: { href: '/', label: 'Go to the start page' } },
        createElement('p', null, 'We could not find that page.'),
      ),
    );
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('We could not find that page.');
  });
  it('puts quieter ways on under the clear one, never a second filled button', () => {
    const html = render(
      createElement(MessagePage, {
        title: 'You do not have access',
        action: { href: '/a', label: 'Back to the admin' },
        also: [
          { href: '/b', label: 'Back to the league' },
          { href: '/c', label: 'Use another account' },
        ],
      }),
    );
    expect(html.match(/data-kind="main"/g)).toHaveLength(1);
    expect(html.match(/data-kind="quiet"/g)).toHaveLength(2);
    expect(html.indexOf('Back to the admin')).toBeLessThan(html.indexOf('Use another account'));
    expect(html).toContain('<p class="ui-message-also">');
    expect(render(createElement(MessagePage, { title: 'T', also: [] }))).not.toContain('also');
  });
  it('keeps a class it is given beside its own', () => {
    expect(render(createElement(MessagePage, { title: 'T', className: 'score-root' }))).toContain(
      'class="ui-message score-root"',
    );
  });
});

describe('a cell with nothing to show', () => {
  it('is a dash kept from screen readers, and a word kept for them', () => {
    expect(render(createElement(NoValue, { word: 'Nothing recorded' }))).toBe(
      '<span class="ui-no-value" aria-hidden="true">–</span><span class="ui-visually-hidden">Nothing recorded</span>',
    );
    // With no word it is the dash alone.
    expect(render(createElement(NoValue, {}))).toBe(
      '<span class="ui-no-value" aria-hidden="true">–</span>',
    );
    expect(displayCss).toMatch(/\.ui-no-value \{\s*color: var\(--color-muted\);/);
  });

  it('is the one piece every table draws its empty cells with', () => {
    const dash = '<span class="ui-no-value" aria-hidden="true">–</span>';
    const one = render(createElement(NoValue, { word: 'Nothing recorded' }));
    const stats = render(
      createElement(SortableStatsTable, {
        caption: 'Teams',
        columns: [
          { key: 'name', label: 'Team' },
          { key: 'pts', label: 'PTS', numeric: true },
        ],
        rows: [{ id: 'a', cells: { name: 'Bears', pts: null } }],
        labels: { sortBy: 'Sort by', noValue: 'Nothing recorded' },
      }),
    );
    expect(stats).toContain(`<td class="ui-num">${one}</td>`);
    const box = render(
      createElement(BoxScoreTable, {
        teamName: 'Bears',
        columns: [{ key: 'pts', label: 'PTS' }],
        players: [{ id: 'p', name: 'Ada', cells: {} }],
        totals: {},
        labels: { jersey: 'Number', player: 'Player', total: 'Total', noValue: 'Nothing recorded' },
      }),
    );
    expect(box.match(new RegExp(`<td class="ui-num">${one}</td>`, 'g'))).toHaveLength(2);
    // And nothing in a table writes a dash of its own.
    expect(stats.split(dash)).toHaveLength(2);
    expect(box.split(dash)).toHaveLength(3);
  });
});

describe('strip of numbers', () => {
  it('is a named list of numbers, each with its label', () => {
    const html = render(
      createElement(StatStrip, {
        label: 'The season in numbers',
        items: [
          { key: 'teams', label: 'Teams', value: '5' },
          { key: 'played', label: 'Games played', value: '6' },
        ],
      }),
    );
    expect(html).toContain('aria-label="The season in numbers"');
    expect(html).toContain('<dt>Teams</dt><dd>5</dd>');
    expect(html.match(/<dt>/g)).toHaveLength(2);
  });

  const stripOf = (count: number) =>
    render(
      createElement(StatStrip, {
        label: 'Team totals',
        items: Array.from({ length: count }, (_, n) => ({
          key: `s${n}`,
          label: `Stat ${n}`,
          value: String(n),
        })),
      }),
    );

  it('stands up to four numbers in one line, with nothing said about wrapping', () => {
    for (const count of [1, 2, 3, 4]) {
      expect(stripOf(count)).toContain('<dl class="ui-stat-strip">');
    }
  });

  it('wraps more than four onto even lines: so many across on a phone, so many from a tablet up', () => {
    // As few lines as it takes, and the lines as even as they can be.
    expect([5, 6, 7, 8, 9, 10, 12, 13].map((count) => stripAcross(count, 4))).toEqual([
      3, 3, 4, 4, 3, 4, 4, 4,
    ]);
    expect([5, 6, 7, 8, 9, 10, 12, 13].map((count) => stripAcross(count, 6))).toEqual([
      5, 6, 4, 4, 5, 5, 6, 5,
    ]);
    expect(stripAcross(0, 4)).toBe(1);
    expect(stripOf(5)).toContain(
      '<dl class="ui-stat-strip" data-wrap="true" style="--ui-stat-across:3;--ui-stat-across-wide:5">',
    );
    const seven = stripOf(7);
    expect(seven).toContain(
      '<dl class="ui-stat-strip" data-wrap="true" style="--ui-stat-across:4;--ui-stat-across-wide:4">',
    );
    // Still one named list of numbers: every one is there, and none is a table.
    expect(seven.match(/<dt>/g)).toHaveLength(7);
    expect(seven).not.toContain('<table');
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(
      /\.ui-stat-strip\[data-wrap='true'\] \{\s*grid-auto-flow: row;\s*grid-template-columns: repeat\(var\(--ui-stat-across\), minmax\(0, 1fr\)\);\s*overflow: hidden;/,
    );
    expect(css).toMatch(
      /@media \(min-width: 48rem\) \{\s*\.ui-stat-strip\[data-wrap='true'\] \{\s*grid-template-columns: repeat\(var\(--ui-stat-across-wide\), minmax\(0, 1fr\)\);/,
    );
    // On the narrowest phones it is two across, as the short strip is.
    expect(css).toMatch(
      /@media \(max-width: 22\.49rem\) \{\s*\.ui-stat-strip\[data-wrap='true'\] \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    // The hairlines between its cells, whichever cell ends a line: each cell's own, after
    // it and under it, and none of the short strip's lines before a cell.
    expect(css).toMatch(
      /\.ui-stat-strip\[data-wrap='true'\] > \.ui-stat \{\s*margin-block-end: -1px;\s*margin-inline-end: -1px;\s*border-block-start: 0;\s*border-inline-start: 0;\s*border-block-end: 1px solid var\(--color-line\);\s*border-inline-end: 1px solid var\(--color-line\);/,
    );
  });
});

describe('team card and emblem', () => {
  it('draws the first letter of a name in any script, hidden from screen readers', () => {
    expect(initialOf('  owls')).toBe('o');
    expect(initialOf(arabicName)).toBe('ن');
    expect(initialOf('')).toBe('');
    const html = render(createElement(Emblem, { name: 'Owls', color: '#663399' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('--team-color:#663399');
    expect(render(createElement(Emblem, { name: 'Owls', color: 'red;x' }))).not.toContain('red');
  });
  it('is one link to the team, with its record and facts in words', () => {
    const html = render(
      createElement(TeamCard, {
        name: arabicName,
        href: '/x/teams/eagles',
        figure: { label: 'Record', value: '5-1' },
        facts: [{ key: 'seed', label: 'Seed', value: '1' }],
      }),
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`<a href="/x/teams/eagles" dir="auto">${arabicName}</a>`);
    expect(html).toContain('Record</span> 5-1');
    expect(html).toContain('<dt>Seed</dt><dd dir="auto">1</dd>');
  });
});

describe('leader card', () => {
  it('lists the leaders in the order given, each with their number', () => {
    const html = render(
      createElement(LeaderCard, {
        title: 'Points',
        entries: [
          { id: 'a', name: `1. ${arabicName}`, detail: 'Owls · 4 games', value: '13.0' },
          { id: 'b', name: '2. Sam R.', value: '11.0' },
        ],
      }),
    );
    expect(html).toContain('<h3>Points</h3>');
    expect(html).toContain('<ol');
    expect(html.indexOf('13.0')).toBeLessThan(html.indexOf('11.0'));
    expect(html).toContain(`dir="auto">1. ${arabicName}<`);
    expect(html.match(/ui-leader-detail/g)).toHaveLength(1);
  });
});

describe('group that opens and closes', () => {
  it('is a plain disclosure, open or closed as told, with its mark and summary', () => {
    const open = render(
      createElement(Group, {
        title: 'Round 4',
        mark: 'This round',
        summary: '3 games',
        open: true,
        phase: 'current',
        children: 'games',
      }),
    );
    expect(open).toMatch(/<details class="ui-group" open="" data-phase="current">/);
    expect(open).toContain('<h2 dir="auto">Round 4</h2>');
    expect(open).toContain('This round');
    expect(open).toContain('3 games');
    const closed = render(
      createElement(Group, { title: 'Round 1', open: false, children: 'games' }),
    );
    expect(closed).not.toContain('open=""');
  });
});

describe('filter toolbar', () => {
  it('is a named group whose pickers keep their buttons until the page script runs', () => {
    const html = render(
      createElement(FilterToolbar, {
        label: 'Choose what to show',
        children: createElement(RoundPicker, {
          label: 'Round',
          options: [{ value: '1', label: 'Round 1' }],
          value: '1',
          submitLabel: 'Show',
        }),
      }),
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Choose what to show"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain('data-applies');
  });
  it('applies a choice made by tap or click at once, and one moved by key only when confirmed', () => {
    // A closed picker changes at every arrow key: that must not read the page again.
    expect(appliesAtOnce('pointer', false)).toBe(true);
    expect(appliesAtOnce('keyboard', false)).toBe(false);
    // A choice confirmed with Enter in an open list arrives while Enter is down.
    expect(appliesAtOnce('keyboard', true)).toBe(true);
  });
  // Changed by the second code look (H1): the button used to be hidden by the stylesheet
  // alone wherever scripts can run, so before the page's script had started, or if it never
  // loaded, a choice made by tap could not be applied. It is now put away only by the mark
  // the script sets, and until then it is a button that works.
  it('puts the Show button away only once the script says it applies choices itself', () => {
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const scripted = css.slice(css.indexOf('@media (scripting: enabled)'));
    // It hangs under its picker, taking no room, so nothing moves when it comes or goes.
    expect(scripted).toMatch(
      /\.ui-toolbar \.ui-picker button \{[^}]*position: absolute;[^}]*inset-block-start: 100%;/,
    );
    // Before the mark it appears after a moment by itself: the wait ends with it in sight
    // and taking taps, so no rule keeps it away for good unless the script has spoken.
    expect(scripted).toMatch(
      /\.ui-toolbar \.ui-picker button \{[^}]*opacity: 0;\s*pointer-events: none;\s*animation: ui-picker-wait 0s linear 1\.5s forwards;/,
    );
    expect(css).toMatch(
      /@keyframes ui-picker-wait \{\s*to \{\s*opacity: 1;\s*pointer-events: auto;/,
    );
    // Kept away only by the mark: that rule, and no other, stops the wait.
    expect(scripted).toMatch(
      /\.ui-toolbar\[data-applies='true'\] \.ui-picker button \{\s*opacity: 0;\s*pointer-events: none;\s*animation: none;/,
    );
    // There whenever the keyboard is in its picker, mark or no mark (it comes later, so it wins).
    expect(scripted).toMatch(
      /\.ui-toolbar \.ui-picker:has\(:focus-visible\) button \{\s*opacity: 1;\s*pointer-events: auto;/,
    );
    expect(scripted.indexOf(".ui-toolbar[data-applies='true'] .ui-picker button")).toBeLessThan(
      scripted.indexOf('.ui-toolbar .ui-picker:has(:focus-visible) button'),
    );
    // Never taken from the keyboard: a button hidden at the moment its field loses the
    // keyboard cannot take it, and the keyboard would fall off the page.
    expect(css).not.toMatch(/\.ui-picker[^{]* button \{[^}]*(display: none|visibility: hidden)/);
  });
  it('on a phone gives each picker its own row, labels in one shared column, so they line up', () => {
    const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(css.indexOf('@media (max-width: 39.99rem) {\n  .ui-toolbar {'));
    expect(phone.startsWith('@media')).toBe(true);
    expect(phone).toMatch(
      /\.ui-toolbar \{[^}]*grid-template-columns: max-content minmax\(0, 1fr\);/,
    );
    expect(phone).toMatch(
      /\.ui-toolbar \.ui-picker \{[^}]*grid-column: 1 \/ -1;[^}]*grid-template-columns: subgrid;/,
    );
    expect(phone).toMatch(/\.ui-toolbar \.ui-picker select \{\s*inline-size: 100%;/);
  });
  it('sets that mark only when it is running in the browser, never in the page as sent', () => {
    const source = readFileSync(
      new URL('./filter-toolbar/filter-toolbar.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/useEffect\(\(\) => setApplies\(true\), \[\]\)/);
    expect(source).toContain("data-applies={applies ? 'true' : undefined}");
  });
});

describe('a game card is one link, whole', () => {
  const labels = {
    live: 'Live',
    final: 'Final',
    forfeit: 'Forfeit',
    postponed: 'Postponed',
    cancelled: 'Cancelled',
    versus: 'vs',
    winner: 'Winner',
    viewBoxScore: 'View box score',
  };
  const html = render(
    createElement(GameCard, {
      home: { name: 'Hawks', score: 61, color: '#ff0000' },
      away: { name: 'Owls', score: 55 },
      status: 'final',
      whenText: 'Sat 9:00',
      detailsHref: '/x/games/1',
      labels,
    }),
  );
  it('shows each team once, with its color chip, and no "vs" between them', () => {
    expect(html.match(/class="ui-game-team"/g)).toHaveLength(2);
    expect(html.match(/ui-team-chip/g)).toHaveLength(2);
    expect(html).not.toContain('ui-game-versus');
    expect(html.match(/<a /g)).toHaveLength(1);
  });
  it('puts the place on a line of its own, and draws none for a game with no place', () => {
    expect(html).not.toContain('ui-game-place');
    const placed = render(
      createElement(GameCard, {
        home: { name: 'Hawks', score: null },
        away: { name: 'Owls', score: null },
        status: 'scheduled',
        whenText: 'Sat 9:00',
        placeText: 'Central Gym, Court 1',
        labels,
      }),
    );
    expect(placed).toContain('<span class="ui-game-when">Sat 9:00</span>');
    expect(placed).toContain('<span class="ui-game-place" dir="auto">Central Gym, Court 1</span>');
    // The place spans the card under the first line, and the teams sit at the foot, so the
    // cards of a row line up whether or not each has a place.
    expect(displayCss).toMatch(/\.ui-game-place \{[^}]*grid-column: 1 \/ -1;/);
    expect(displayCss).toMatch(/\.ui-game-card \{[^}]*grid-template-rows: auto 1fr;/);
    expect(displayCss).toMatch(/\.ui-game-teams \{[^}]*align-self: end;/);
  });
  it('covers the card with its link and keeps the link words for screen readers only', () => {
    expect(displayCss).toMatch(/\.ui-game-link \{[^}]*position: absolute;[^}]*inset: 0;/);
    expect(displayCss).toMatch(/\.ui-game-link \{[^}]*text-indent: 200%;/);
    expect(displayCss).toMatch(/\.ui-game-card \{[^}]*position: relative;/);
  });
});

describe('tables', () => {
  it('give a team its color chip beside its name', () => {
    const html = render(
      createElement(StandingsTable, {
        caption: 'East',
        idPrefix: 'east',
        columns: [{ key: 'w', label: 'W' }],
        rows: [{ id: 'a', team: 'Owls', color: '#663399', cells: { w: 5 } }],
        labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
      }),
    );
    expect(html).toContain('--team-color:#663399');
    expect(html).toMatch(/<th scope="row" class="ui-team-cell"><span class="ui-team-chip"/);
  });
  it('give a team its color chip in a statistics table too, under the column that names it', () => {
    const html = render(
      createElement(SortableStatsTable, {
        caption: 'All players',
        columns: [
          { key: 'player', label: 'Player' },
          { key: 'team', label: 'Team' },
          { key: 'pts', label: 'PTS', numeric: true },
        ],
        rows: [
          { id: 'a', cells: { player: 'Dana', team: 'Owls', pts: 12 }, chips: { team: '#663399' } },
          { id: 'b', cells: { player: 'Sam', team: 'Owls, Hawks', pts: 9 }, chips: { team: null } },
          { id: 'c', cells: { player: 'Noor', team: 'Hawks', pts: 7 }, chips: { team: 'red;x' } },
        ],
        labels: { sortBy: 'Sort by' },
      }),
    );
    expect(html).toContain(
      '<td><span class="ui-team-chip" aria-hidden="true" style="--team-color:#663399"></span><span dir="auto">Owls</span></td>',
    );
    // No color, or one that is not a color: the plain chip, so the names stay in line.
    expect(html.match(/ui-team-chip/g)).toHaveLength(3);
    expect(html.match(/--team-color/g)).toHaveLength(1);
    expect(html).not.toContain('red;x');
    // A row that names no team in a column has no chip there.
    const none = render(
      createElement(SortableStatsTable, {
        caption: 'Leaders',
        columns: [{ key: 'player', label: 'Player' }],
        rows: [{ id: 'a', cells: { player: 'Dana' } }],
        labels: { sortBy: 'Sort by' },
      }),
    );
    expect(none).not.toContain('ui-team-chip');
    const teams = render(
      createElement(SortableStatsTable, {
        caption: 'Teams',
        columns: [{ key: 'team', label: 'Team' }],
        rows: [{ id: 'a', cells: { team: 'Owls' }, chips: { team: '#663399' } }],
        labels: { sortBy: 'Sort by' },
      }),
    );
    expect(teams).toMatch(/<th scope="row" class="ui-team-cell"><span class="ui-team-chip"/);
  });
  it('can keep a caption for screen readers under a heading that says the same', () => {
    const table = (captionHidden: boolean) =>
      render(
        createElement(SortableStatsTable, {
          caption: 'All players',
          captionHidden,
          columns: [{ key: 'n', label: 'Player' }],
          rows: [],
          labels: { sortBy: 'Sort by' },
        }),
      );
    expect(table(true)).toContain('<caption dir="auto" class="ui-visually-hidden">');
    expect(table(false)).toContain('<caption dir="auto">All players</caption>');
  });
  it('scroll inside their own box with the name column staying put', () => {
    expect(displayCss).toMatch(/\.ui-table-wrap \{[^}]*overflow-x: auto;/);
    expect(displayCss).toMatch(
      /\.ui-team-cell \{[^}]*position: sticky;[^}]*inset-inline-start: 0;/,
    );
    expect(displayCss).toMatch(/\.ui-table \.ui-num \{[^}]*inline-size: 1%;[^}]*text-align: end;/);
  });
  it('hold the column that stays put to a share of the box, so a long name never hides the numbers', () => {
    // The box is the measure, and the name is held to about 45% of it and wraps, whole.
    expect(displayCss).toMatch(/\.ui-table-wrap \{[^}]*container-type: inline-size;/);
    // A box that is a measure takes no width from what it holds, so it has its own: a
    // parent that shrinks to fit could otherwise collapse the table to nothing.
    expect(displayCss).toMatch(
      /\.ui-table-wrap \{[^}]*inline-size: 100%;\s*container-type: inline-size;/,
    );
    expect(displayCss).toMatch(
      /\.ui-team-cell > \[dir\] \{[^}]*max-inline-size: calc\(45cqi - var\(--step-6\)\);[^}]*white-space: normal;/,
    );
    // The name is an element of its own in that cell in every table, so the limit reaches it.
    const long = 'The Northside Community Thunderbolts';
    const tables = [
      render(
        createElement(StandingsTable, {
          caption: 'East',
          idPrefix: 'east',
          columns: [{ key: 'w', label: 'W' }],
          rows: [{ id: 'a', team: long, color: '#663399', cells: { w: 5 } }],
          labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
        }),
      ),
      render(
        createElement(SortableStatsTable, {
          caption: 'Teams',
          columns: [{ key: 'team', label: 'Team' }],
          rows: [{ id: 'a', cells: { team: long }, chips: { team: '#663399' } }],
          labels: { sortBy: 'Sort by' },
        }),
      ),
      render(
        createElement(BoxScoreTable, {
          teamName: 'Owls',
          columns: [{ key: 'pts', label: 'PTS' }],
          players: [{ id: 'p', jersey: '7', name: long, cells: { pts: 1 } }],
          totals: { pts: 1 },
          labels: { jersey: 'No.', player: 'Player', total: 'Total' },
        }),
      ),
    ];
    for (const html of tables) {
      expect(html).toMatch(
        new RegExp(
          // In the standings the name's own words have an element of their own inside it.
          `<th scope="row" class="ui-team-cell">(<span class="ui-team-chip"[^>]*></span>)?<span dir="auto">(<span class="ui-team-name">)?${long}</span>`,
        ),
      );
    }
  });
  it('give the column that stays put an edge while the table is scrolled under it', () => {
    // A hairline and a soft shadow on its far side, there only while scrolled: a number half
    // under the column is then plainly covered, not read as another number.
    expect(displayCss).toMatch(
      /\.ui-team-cell::after \{[^}]*inset-inline-start: 100%;[^}]*border-inline-start: 1px solid var\(--color-line-strong\);[^}]*opacity: 0;[^}]*animation: ui-table-stuck linear both;\s*animation-timeline: --ui-table-scroll;/,
    );
    expect(displayCss).toMatch(/@keyframes ui-table-stuck \{\s*0% \{\s*opacity: 0;/);
    // Mirrored for right-to-left, and a plain hairline where the scroll cannot be followed.
    expect(displayCss).toMatch(/\[dir='rtl'\] \.ui-team-cell::after \{[^}]*to left/);
    expect(displayCss).toMatch(
      /@supports not \(timeline-scope: --ui-table-scroll\) \{\s*\.ui-team-cell \{\s*border-inline-end: 1px solid/,
    );
  });
  it('keep "Total" exactly as wide as the names above it, so it covers no more when scrolled', () => {
    const html = render(
      createElement(BoxScoreTable, {
        teamName: 'Owls',
        columns: [{ key: 'pts', label: 'PTS' }],
        players: [{ id: 'p', jersey: '7', name: 'Max', cells: { pts: 1 } }],
        totals: { pts: 1 },
        labels: { jersey: 'No.', player: 'Player', total: 'Total' },
      }),
    );
    // One cell under the numbers worn, then "Total" under the names: no cell spans two.
    expect(html).toContain(
      '<tfoot><tr><td></td><th scope="row" class="ui-team-cell">Total</th><td class="ui-num">1</td></tr></tfoot>',
    );
    expect(html).not.toContain('colSpan');
    expect(html).not.toContain('colspan');
    const hidden = render(
      createElement(BoxScoreTable, {
        teamName: 'Owls',
        columns: [{ key: 'pts', label: 'PTS' }],
        players: null,
        totals: { pts: 1 },
        labels: { jersey: 'No.', player: 'Player', total: 'Total' },
      }),
    );
    expect(hidden).toContain('<tfoot><tr><th scope="row" class="ui-team-cell">Total</th>');
  });
  it('give the two box scores of one game the same column widths, and never a blank cell', () => {
    const table = (players: Parameters<typeof BoxScoreTable>[0]['players']) =>
      render(
        createElement(BoxScoreTable, {
          teamName: 'Owls',
          columns: [
            { key: 'pts', label: 'PTS' },
            { key: 'pf', label: 'PF' },
          ],
          players,
          totals: { pts: 10, pf: '' },
          labels: {
            jersey: 'No.',
            player: 'Player',
            total: 'Total',
            team: 'Team',
            noValue: 'Nothing recorded',
          },
          nameRoom: 12,
        }),
      );
    // The page tells both tables the letters of the longest name of either.
    const shown = table([{ id: 'p', jersey: '7', name: 'Max', cells: { pts: 4 } }]);
    expect(shown).toContain('<table class="ui-table ui-box-score" style="--name-room:12">');
    expect(displayCss).toMatch(
      /\.ui-box-score \.ui-team-cell > \[dir\] \{\s*min-inline-size: min\(calc\(var\(--name-room, 0\) \* 1ch\), calc\(45cqi - var\(--step-6\)\)\);/,
    );
    expect(displayCss).toMatch(
      /\.ui-box-score tr > \.ui-num:first-child \{\s*inline-size: var\(--step-7\);/,
    );
    // A statistic with nothing recorded, in a player's row and in the totals: a dash, and a
    // word for screen readers.
    const dash =
      '<td class="ui-num"><span class="ui-no-value" aria-hidden="true">–</span><span class="ui-visually-hidden">Nothing recorded</span></td>';
    expect(shown.split(dash)).toHaveLength(3);
    // A table that lists no players has "Team" over "Total", not an empty heading cell, and
    // gives that column the width the other table's first two have together.
    const hidden = table(null);
    expect(hidden).toContain('data-players="hidden"');
    expect(hidden).toContain('<thead><tr><th scope="col" class="ui-team-cell">Team</th>');
    expect(displayCss).toMatch(
      /\.ui-box-score\[data-players='hidden'\] \.ui-team-cell \{\s*inline-size: calc\(\s*var\(--step-7\) \+ 2 \* var\(--step-3\) \+/,
    );
  });
  it("give the team column one width in every division's table, so the numbers line up down the page", () => {
    expect(displayCss).toMatch(/\.ui-standings \.ui-team-cell \{\s*min-inline-size: 7\.5rem;/);
    // With emblems the column is wider by what a shield is wider than a chip (24 and 12),
    // as the name's own limit is narrower by it, so a name of seven letters with a note's
    // mark still fits the column in every division.
    expect(displayCss).toMatch(
      /\.ui-standings\[data-emblems='true'\] \.ui-team-cell \{\s*min-inline-size: calc\(7\.5rem \+ var\(--step-3\)\);/,
    );
    expect(displayCss).toMatch(
      /\.ui-standings\[data-emblems='true'\] \.ui-team-cell > \[dir\] \{\s*max-inline-size: calc\(45cqi - var\(--step-6\) - var\(--step-3\)\);/,
    );
    // Both the heading and the rows carry it, so it holds for a table of any number of rows.
    const html = render(
      createElement(StandingsTable, {
        caption: 'East',
        idPrefix: 'east',
        columns: [{ key: 'w', label: 'W' }],
        rows: [{ id: 'a', team: 'Owls', cells: { w: 5 } }],
        labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
      }),
    );
    expect(html).toContain('<table class="ui-table ui-standings">');
    expect(html.match(/class="ui-team-cell"/g)).toHaveLength(2);
  });

  it('on a phone keep the record and the ordering column in view, and leave out what the columns say', () => {
    const html = render(
      createElement(StandingsTable, {
        caption: 'East',
        idPrefix: 'east',
        columns: [
          { key: 'gp', label: 'GP', narrow: 'left-out' },
          { key: 'w', label: 'W', narrow: 'in-view' },
          { key: 'l', label: 'L', narrow: 'in-view' },
          { key: 'pct', label: 'PCT', narrow: 'in-view' },
          { key: 'pf', label: 'PF' },
        ],
        rows: [
          { id: 'a', seed: 1, team: 'Owls', cells: { gp: 6, w: 5, l: 1, pct: '.833', pf: 300 } },
        ],
        labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
      }),
    );
    expect(html).toContain('data-narrow="fit" style="--ui-in-view:3;--ui-seed-col:1"');
    // Games played, in the heading and the row, leaves its place on a phone and is drawn
    // again straight after the last column in view, the first one scrolled to: never lost.
    expect(html.match(/class="ui-num ui-left-out"/g)).toHaveLength(2);
    expect(html.match(/class="ui-num ui-moved"/g)).toHaveLength(2);
    expect(html).toMatch(/>PCT<\/th><th scope="col" class="ui-num ui-moved">GP<\/th><th[^>]*>PF</);
    expect(html.match(/class="ui-num ui-last-in-view"/g)).toHaveLength(2);
    expect(displayCss).toMatch(/\.ui-standings \.ui-moved \{\s*display: none;/);
    expect(displayCss).toMatch(/@media \(max-width: 30rem\) \{\s*\.ui-standings\[data-narrow\] \{/);
    expect(displayCss).toMatch(/\.ui-standings\[data-narrow\] \.ui-left-out \{\s*display: none;/);
    expect(displayCss).toMatch(
      /\.ui-standings\[data-narrow\] \.ui-moved \{\s*display: table-cell;/,
    );
    // The last column in view has room for five figures ("1.000") in the table's own face.
    expect(displayCss).toMatch(
      /--ui-last-col: max\(var\(--ui-num-col\), calc\(5ch \+ 6 \* var\(--step-1\)\)\);/,
    );
  });
  it('fade the far edge lightly: a column wholly in view under it keeps its digits', () => {
    // Narrow, and reaching the panel's color only at the very edge: never a solid band. A
    // step narrower since step 2.147 part 3 (16, was 24): under the wider one a number cut
    // by the box's edge lost a whole digit and read as another number (155 as 15).
    expect(displayCss).toMatch(
      /\.ui-table-frame::before \{[^}]*inline-size: var\(--step-4\);[^}]*linear-gradient\(to right, transparent, var\(--color-panel\)\);/,
    );
    expect(displayCss).not.toMatch(/transparent, var\(--color-panel\) \d+%\)/);
  });
  it('never put the scroll arrow on a column heading: over a table with no name in view it stands above the box', () => {
    // Step 2.147 part 3: such a table had a band of its own for the arrow, which read as an
    // empty strip with an arrow alone in it. The arrow now stands over the box's far
    // corner, in the gap under the section's title, and the headings have the box's top.
    expect(displayCss).toMatch(
      /\.ui-table-frame:has\(caption\.ui-visually-hidden\)::after \{\s*inset-block-start: calc\(-1 \* \(var\(--step-4\) \+ var\(--step-1\)\)\);/,
    );
    expect(displayCss).not.toMatch(
      /\.ui-table-frame:has\(caption\.ui-visually-hidden\) \.ui-table-wrap \{\s*padding-block-start/,
    );
    // And the clear patch the fade keeps behind an arrow inside the box is out of the way.
    expect(displayCss).toMatch(
      /\.ui-table-frame:has\(caption\.ui-visually-hidden\) \{\s*--ui-table-arrow: calc\(-1 \* var\(--step-8\)\);/,
    );
  });
  it('keep the ring of a heading button whole, and what the keyboard reaches clear of the name column', () => {
    expect(displayCss).toMatch(
      /\.ui-table \.ui-sort-button:focus-visible \{\s*outline-offset: -3px;/,
    );
    expect(displayCss).toMatch(/\.ui-table-wrap \{[^}]*scroll-padding-inline-start: 50%;/);
  });
  it('show at the far edge of their box that they go on, only while they do', () => {
    // The box stays still and the table scrolls inside it, so the box can carry the sign.
    const standings = render(
      createElement(StandingsTable, {
        caption: 'East',
        idPrefix: 'east',
        columns: [{ key: 'w', label: 'W' }],
        rows: [{ id: 'a', team: 'Owls', cells: { w: 5 }, notes: ['n'] }],
        footnotes: [{ id: 'n', text: 'A note' }],
        labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
      }),
    );
    const stats = render(
      createElement(SortableStatsTable, {
        caption: 'All players',
        columns: [{ key: 'player', label: 'Player' }],
        rows: [],
        labels: { sortBy: 'Sort by' },
      }),
    );
    const boxScore = render(
      createElement(BoxScoreTable, {
        teamName: 'Owls',
        columns: [{ key: 'pts', label: 'PTS' }],
        players: [],
        totals: { pts: 0 },
        labels: { jersey: 'No.', player: 'Player', total: 'Total' },
      }),
    );
    for (const html of [standings, stats, boxScore]) {
      expect(html).toMatch(/^<div class="ui-table-frame"><div class="ui-table-wrap" tabindex="0"/);
    }
    // The sign follows the table's own sideways scroll, and is not drawn without it.
    expect(displayCss).toMatch(/\.ui-table-frame \{[^}]*timeline-scope: --ui-table-scroll;/);
    expect(displayCss).toMatch(/\.ui-table-wrap \{[^}]*scroll-timeline: --ui-table-scroll inline;/);
    expect(displayCss).toMatch(
      /\.ui-table-frame::before,\s*\.ui-table-frame::after \{[^}]*opacity: 0;[^}]*animation-timeline: --ui-table-scroll;/,
    );
    expect(displayCss).toMatch(/@keyframes ui-table-more \{[^@]*100% \{\s*opacity: 0;/);
    // It never takes a tap from the table, and never fades the notes under it.
    expect(displayCss).toMatch(/\.ui-table-frame::after \{[^}]*pointer-events: none;/);
    expect(displayCss).toMatch(
      /\.ui-footnotes,\s*\.ui-table-notice \{[^}]*z-index: 3;[^}]*background: var\(--color-panel\);/,
    );
    // A browser that cannot follow the scroll keeps the soft shadow at the edge.
    expect(displayCss).toMatch(/\.ui-table-wrap \{[^}]*var\(--scroll-shadow\)/);
    // The heading of the name column stays over the names, so a number's heading is never
    // read as theirs once the table is scrolled; and the table's own name stays in view.
    expect(standings).toContain('<th scope="col" class="ui-team-cell">Team</th>');
    expect(stats).toMatch(/<th scope="col" class="ui-team-cell" aria-sort="none">/);
    expect(boxScore).toContain('<th scope="col" class="ui-team-cell">Player</th>');
    expect(displayCss).toMatch(
      /\.ui-table caption:not\(\.ui-visually-hidden\) \{[^}]*position: sticky;[^}]*inset-inline-start: 0;/,
    );
  });
});

describe('the stylesheet of the page pieces', () => {
  const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
  it('takes every size and gap from the design, never a size of its own', () => {
    // Sizes of type come only from the type scale.
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => (m[1] ?? '').trim());
    expect(sizes.length).toBeGreaterThan(20);
    for (const size of sizes) expect(size).toMatch(/^(var\(--text-\d+\)|inherit|0\.7em)$/);
    // Every gap, padding, margin and inset, on either axis and either side, is a step of
    // the spacing scale (DESIGN.md, section 4, line 2). The only bare lengths are a
    // hairline, the one pixel that hides words kept for screen readers, and a share (%).
    const step = String.raw`var\(--(?:step-\d|space(?:-tight|-section)?)\)`;
    // A table of statistics on a phone picks one of two steps by whether its columns fit
    // (--ui-too-many and --ui-few are 0 or a great length): still only steps of the scale.
    const fit = String.raw`var\(--ui-(?:too-many|few)\)`;
    const pick = String.raw`max\(${step}, min\(${fit}, ${step}\)\)|min\(${fit}, ${step}\)`;
    const plain = String.raw`(?:${step}|${pick}|0|auto|-?1px|\d+%)`;
    const sum = String.raw`calc\((?:${step}|-?1px|\d+%|-?\d+|[-+*/ ()])+\)`;
    const onScale = new RegExp(`^(?:${plain}|${sum})(?: (?:${plain}|${sum}))*$`);
    const spaces = [
      ...css.matchAll(
        /(?:^|[\s;{])((?:row-|column-)?gap|(?:padding|margin|inset)(?:-block|-inline)?(?:-start|-end)?):\s*([^;]+);/g,
      ),
    ].map((m) => `${m[1]}: ${(m[2] ?? '').trim().replace(/\s+/g, ' ')}`);
    expect(spaces.length).toBeGreaterThan(150);
    expect(spaces.filter((space) => !onScale.test(space.slice(space.indexOf(': ') + 2)))).toEqual(
      [],
    );
    // The check does see the sides it names: these are in the stylesheet, and pass.
    for (const seen of ['margin-inline: auto', 'inset-inline-start: 0', 'inset: 0']) {
      expect(spaces).toContain(seen);
    }
    for (const off of ['0.125rem', '0.35em', '0.4em', '2px 4px']) {
      expect(onScale.test(off)).toBe(false);
    }
  });
  it('never shows a browser button or field as the browser draws it', () => {
    expect(css).toMatch(/\.ui-root :where\(button, input\[type='submit'\]/);
    expect(css).toMatch(
      /select,\s*textarea\s*\)\s*\{[^}]*border: 1px solid var\(--color-line-strong\)/,
    );
  });
  it('keeps everything a thumb taps at least 44 high', () => {
    // Every piece that is tapped, by its own rule: a link that stands alone, a picker and
    // its button, a heading that sorts, a group that opens (48). The browser test measures
    // the same on the pages themselves (tests/browser/web-exit-test.mjs).
    const tall = /min-block-size: var\(--(?:tap|step-7)\);/;
    for (const selector of [
      '.ui-more',
      '.ui-crumbs a',
      '.ui-picker select,\n.ui-picker button',
      '.ui-sort-button',
      '.ui-group > summary',
    ]) {
      const at = css.indexOf(`\n${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      const block = css.slice(at);
      expect(block.slice(0, block.indexOf('}')), selector).toMatch(tall);
    }
    // Every button and every field, whatever page it is on.
    expect(css).toMatch(
      /\.ui-root :where\(button, input\[type='submit'\][^{]*\{[^}]*min-block-size: var\(--tap\);/,
    );
    expect(css).toMatch(/select,\s*textarea\s*\)\s*\{[^}]*min-block-size: var\(--tap\);/);
    // A card that is a link is covered whole by it, and a card is taller than 44.
    expect(css).toMatch(/\.ui-game-link \{[^}]*inset: 0;/);
    expect(css).toMatch(/\.ui-team-card-name a::after \{[^}]*inset: 0;/);
    expect(css).toMatch(/\.ui-game-team \{[^}]*min-block-size: var\(--step-6\);/);
    expect(css).toMatch(/\.ui-emblem \{[^}]*block-size: var\(--step-7\);/);
  });
  it('names the tap height once, as a variable, and no size off the scales', () => {
    // 44 is written in the design's values (packages/site, scales.ts), never here.
    expect(css).not.toContain('2.75rem');
    for (const raw of ['0.375rem', '0.3125rem', '1.25rem']) expect(css).not.toContain(raw);
  });
});

describe('the plain list (step 2.154)', () => {
  it('lays things one under another with no bullets or indent, each as tall as its content', () => {
    expect(displayCss).toMatch(
      /\.ui-list \{[^}]*align-content: start;[^}]*gap: var\(--step-4\);[^}]*padding: 0;[^}]*list-style: none;/,
    );
  });
});
