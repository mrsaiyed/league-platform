// The pieces a page is laid out with (step 2.85): what each shows, that names in any script
// keep their own direction (T-188), and that the stylesheet covers the things the look
// depends on (docs/build/DESIGN.md, section 4).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Emblem,
  EmptyPanel,
  FilterToolbar,
  GameCard,
  Group,
  LeaderCard,
  MessagePage,
  PageHead,
  RoundPicker,
  Section,
  SortableStatsTable,
  StandingsTable,
  StatStrip,
  TeamCard,
  displayCss,
  initialOf,
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
  it('keeps a class it is given beside its own', () => {
    expect(render(createElement(MessagePage, { title: 'T', className: 'score-root' }))).toContain(
      'class="ui-message score-root"',
    );
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
});

describe('the stylesheet of the page pieces', () => {
  const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
  it('takes every size and gap from the design, never a size of its own', () => {
    // Sizes of type come only from the type scale.
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => (m[1] ?? '').trim());
    expect(sizes.length).toBeGreaterThan(20);
    for (const size of sizes) expect(size).toMatch(/^(var\(--text-\d+\)|inherit|0\.7em)$/);
    // Gaps, padding and margins come only from the spacing variables; a hairline or a
    // pill's two pixels of padding are the only bare lengths.
    const spaces = [
      ...css.matchAll(/(?:^|[\s;{])(?:gap|padding(?:-block|-inline)?|margin-block):\s*([^;]+);/g),
    ].flatMap((m) => (m[1] ?? '').trim().split(/\s+/));
    for (const part of spaces) {
      expect(part).toMatch(
        /^(var\(--(step-\d|space(-tight|-section)?)\)|0|1px|0\.125rem|0\.\d+em)$/,
      );
    }
  });
  it('never shows a browser button or field as the browser draws it', () => {
    expect(css).toMatch(/\.ui-root :where\(button, input\[type='submit'\]/);
    expect(css).toMatch(
      /select,\s*textarea\s*\)\s*\{[^}]*border: 1px solid var\(--color-line-strong\)/,
    );
  });
  it('keeps everything a thumb taps at least 44 high', () => {
    for (const selector of ['.ui-more', '.ui-crumbs a', '.ui-picker select,\n.ui-picker button']) {
      const block = css.slice(css.indexOf(`${selector} {`));
      expect(block.slice(0, block.indexOf('}')), selector).toContain('min-block-size: 2.75rem');
    }
  });
});
