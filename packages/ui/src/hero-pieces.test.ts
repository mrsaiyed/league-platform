// The pieces of the first starting design (step 2.147, C-16): the kicker over a title,
// the hero, the team emblem, a game as a scoreboard and the band near the foot. What each
// shows, that names in any script keep their own direction (T-188), that a winner is
// marked by more than color, and that every color comes from the design (T-90).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CallBand,
  Emblem,
  GameCard,
  Hero,
  Section,
  StandingsTable,
  displayCss,
  isLongName,
  titleLines,
} from '../index.ts';

const arabicName = 'نسور الصحراء';
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const css = displayCss.replace(/\/\*[\s\S]*?\*\//g, '');
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

describe('a kicker over a title', () => {
  it('is a tiny label before the level-two title, which then has no rule of its own', () => {
    const html = render(
      createElement(Section, {
        title: 'The next matchups',
        kicker: 'On the schedule',
        more: { href: '/x/schedule', label: 'See the full schedule' },
        children: 'body',
      }),
    );
    expect(html).toContain(
      '<div class="ui-section-title"><p class="ui-kicker">On the schedule</p><h2>The next matchups</h2></div>',
    );
    expect(html).toContain('<a class="ui-more" href="/x/schedule">See the full schedule</a>');
    expect(css).toMatch(/\.ui-section-title h2::after \{\s*content: none;/);
    // A short rule, drawn in the label's own color, then the label: small, in capitals,
    // widely spaced.
    expect(css).toMatch(
      /\.ui-kicker \{[^}]*font-size: var\(--text-12\);[^}]*letter-spacing: 0\.2em;[^}]*text-transform: uppercase;/,
    );
    expect(css).toMatch(
      /\.ui-kicker::before \{[^}]*inline-size: var\(--step-5\);\s*block-size: 1px;\s*background: currentColor;/,
    );
    // A section with no kicker is as it was: its title carries the short rule.
    expect(render(createElement(Section, { title: 'A', children: 'b' }))).not.toContain(
      'ui-kicker',
    );
  });
});

describe('the hero', () => {
  it('sets a name in two lines, the last word or about two fifths of it on the second', () => {
    expect(titleLines('North Valley League')).toEqual(['North Valley', 'League']);
    expect(titleLines('  Harbor   City League ')).toEqual(['Harbor City', 'League']);
    expect(titleLines('Lakers')).toEqual(['Lakers', undefined]);
    expect(titleLines('')).toEqual(['', undefined]);
    expect(titleLines('The Greater Northside Community Basketball Association')).toEqual([
      'The Greater Northside Community',
      'Basketball Association',
    ]);
    expect(titleLines('دوري الوادي الشمالي')).toEqual(['دوري الوادي', 'الشمالي']);
  });

  const html = render(
    createElement(Hero, {
      title: 'North Valley League',
      kicker: 'Fall 2026',
      text: 'Scores and standings.',
      columnClass: 'site-column',
      actions: [
        { href: '/x/schedule', label: 'See the schedule', kind: 'main' },
        { href: '/x/standings', label: 'View the standings', kind: 'second' },
      ],
    }),
  );

  it("is the page's one title, read whole, with its second line picked out", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(
      '<h1 class="ui-hero-title" dir="auto"><span>North Valley</span> <span class="ui-hero-title-pop">League</span></h1>',
    );
    expect(html).toContain('<p class="ui-kicker">Fall 2026</p>');
    expect(html.indexOf('Fall 2026')).toBeLessThan(html.indexOf('<h1'));
    expect(html).toContain('<p class="ui-hero-text">Scores and standings.</p>');
    expect(html).toContain('class="ui-hero-inner site-column"');
    expect(css).toMatch(/\.ui-hero-title-pop \{\s*color: var\(--color-band-pop\);/);
    expect(css).toMatch(/\.ui-hero-title > span \{\s*display: block;/);
  });

  it('offers one filled button, with an arrow, and one outlined', () => {
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain(
      '<a class="ui-button" data-kind="pop" data-arrow="true" href="/x/schedule">See the schedule</a>',
    );
    expect(html).toContain(
      '<a class="ui-button" data-kind="ghost" href="/x/standings">View the standings</a>',
    );
    expect(css).toMatch(
      /\.ui-button\[data-kind='pop'\] \{\s*border-color: var\(--color-band-pop\);\s*background: var\(--color-band-pop\);\s*color: var\(--color-on-band-pop\);/,
    );
    expect(css).toMatch(
      /\.ui-button\[data-kind='ghost'\] \{[^}]*background: transparent;\s*color: var\(--color-on-band\);/,
    );
    // The arrow is drawn in the color of its words, and turns around right to left.
    expect(css).toMatch(
      /\.ui-more::after,\s*\.ui-button\[data-arrow='true'\]::after \{[^}]*background: currentColor;[^}]*mask: var\(--ui-arrow\)/,
    );
    expect(css).toMatch(/\[dir='rtl'\] \.ui-more::after,[^{]*\{\s*transform: scaleX\(-1\);/);
  });

  it('is finished with no picture: a gradient and a pattern from the band’s own colors', () => {
    expect(html).not.toContain('<img');
    // The pattern's mark is drawn from the league's first letter, silent to a screen reader.
    expect(html).toMatch(/<svg class="ui-hero-art"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<text[^>]*>N<\/text>/);
    // The band's own color lies under its gradient, so its words are on that color with
    // or without the gradient.
    expect(css).toMatch(
      /\.ui-hero \{[^}]*background-color: var\(--color-band\);\s*background-image: linear-gradient\(100deg, var\(--color-band\) 0%, var\(--color-band-deep\) 78%\);[^}]*color: var\(--color-on-band\);/,
    );
    expect(css).toMatch(
      /\.ui-hero::before \{[^}]*var\(--color-band-glow\)[^}]*repeating-linear-gradient/,
    );
    // Mirrored for a right-to-left page.
    expect(css).toMatch(/\[dir='rtl'\] \.ui-hero \{\s*background-image: linear-gradient\(260deg,/);
  });

  it('takes a league’s own picture, laid under the band’s color, when it has one', () => {
    const pictured = render(
      createElement(Hero, { title: 'Owls', picture: { src: '/files/hero.jpg' } }),
    );
    expect(pictured).toContain('<img class="ui-hero-picture" src="/files/hero.jpg" alt=""/>');
    expect(css).toMatch(/\.ui-hero-picture \{[^}]*z-index: -2;[^}]*object-fit: cover;/);
    expect(css).toMatch(
      /\.ui-hero:has\(\.ui-hero-picture\)::before \{[^}]*var\(--color-band-deep\) 0%/,
    );
  });

  it('sets a long name one step smaller, and holds what stands beside the words', () => {
    expect(html).not.toContain('data-title');
    expect(html).not.toContain('data-aside');
    const long = render(
      createElement(
        Hero,
        { title: 'The Greater Northside Community Basketball Association' },
        createElement('p', null, 'live'),
      ),
    );
    expect(long).toContain('data-aside="true"');
    expect(long).toContain('data-title="longest"');
    expect(long).toContain('<div class="ui-hero-aside"><p>live</p></div>');
    // A line of more than thirteen letters is long; of more than twenty-two, longest.
    expect(render(createElement(Hero, { title: 'Northamptonshire Royals' }))).toContain(
      'data-title="long"',
    );
    expect(render(createElement(Hero, { title: 'Metropolitans United' }))).not.toContain(
      'data-title',
    );
    // Every size of the title is a step of the type scale.
    const sizes = [...css.matchAll(/\.ui-hero-title \{\s*font-size: (var\(--text-\d+\));/g)].map(
      (m) => m[1],
    );
    expect(new Set(sizes)).toEqual(
      new Set([
        'var(--text-22)',
        'var(--text-28)',
        'var(--text-36)',
        'var(--text-48)',
        'var(--text-64)',
        'var(--text-88)',
      ]),
    );
    // A name in another script keeps its own direction.
    expect(render(createElement(Hero, { title: arabicName }))).toContain('dir="auto"');
  });
});

describe('a team emblem', () => {
  it('is a shield with the first letter, drawn from data as part of the page', () => {
    const html = render(createElement(Emblem, { name: 'owls', color: '#663399' }));
    expect(html).toMatch(
      /^<svg class="ui-emblem" data-size="card" data-kind="team" viewBox="0 0 48 56"/,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('style="--team-color:#663399"');
    expect(html).toMatch(/<text class="ui-emblem-letter"[^>]*>o<\/text>/);
    expect(html).not.toMatch(/<image|href=|url\(/);
    expect(render(createElement(Emblem, { name: arabicName }))).toMatch(/>ن<\/text>/);
    // Three sizes: in a row of a table, in a card, at the head of a page.
    for (const size of ['small', 'card', 'large'] as const) {
      expect(render(createElement(Emblem, { name: 'Owls', size }))).toContain(
        `data-size="${size}"`,
      );
    }
  });

  it('is drawn in the team’s color, lifted toward the page’s text so it shows on any page', () => {
    expect(css).toMatch(
      /\.ui-emblem \{\s*--emblem-color: var\(--team-color, var\(--color-accent\)\);[^}]*color: color-mix\(in srgb, var\(--emblem-color\) 74%, var\(--color-text\)\);/,
    );
    expect(css).toMatch(
      /\.ui-emblem-shield \{\s*fill: color-mix\(in srgb, var\(--emblem-color\) 30%, transparent\);\s*stroke: currentColor;/,
    );
    // The letter is in the page's text color, so it reads whatever color the team chose.
    expect(css).toMatch(
      /\.ui-emblem-letter \{\s*color: var\(--color-text\);\s*fill: currentColor;\s*font-family: var\(--font-heading\);/,
    );
    // The league's own mark is filled with the strongest color of its bands, its letter in
    // the color of a band's words.
    expect(css).toMatch(
      /\.ui-emblem\[data-kind='league'\] \.ui-emblem-shield \{\s*fill: var\(--color-band-glow\);/,
    );
    expect(css).toMatch(
      /\.ui-emblem\[data-kind='league'\] \.ui-emblem-letter \{\s*color: var\(--color-on-band\);/,
    );
  });

  it('can stand in a table in place of the color chip', () => {
    const table = (emblems: boolean) =>
      render(
        createElement(StandingsTable, {
          caption: 'East',
          idPrefix: 'east',
          columns: [{ key: 'w', label: 'W' }],
          rows: [{ id: 'a', seed: 1, team: arabicName, color: '#663399', cells: { w: 5 } }],
          labels: { seed: 'Seed', team: 'Team', note: 'Note', notes: 'Notes' },
          emblems,
        }),
      );
    expect(table(true)).toMatch(
      new RegExp(
        `<th scope="row" class="ui-team-cell"><svg class="ui-emblem" data-size="small"[^>]*style="--team-color:#663399">.*?</svg><span dir="auto">${arabicName}</span>`,
      ),
    );
    expect(table(true)).not.toContain('ui-team-chip');
    expect(table(true)).toContain('<table class="ui-table ui-standings" data-emblems="true">');
    expect(table(false)).toContain('ui-team-chip');
    expect(table(false)).not.toContain('ui-emblem');
    // The emblem is wider than the chip, so the name gives up that much of its share.
    expect(css).toMatch(
      /\.ui-standings\[data-emblems='true'\] \.ui-team-cell > \[dir\] \{\s*max-inline-size: calc\(45cqi - var\(--step-6\) - var\(--step-3\)\);/,
    );
  });
});

describe('a game as a scoreboard', () => {
  type Props = Parameters<typeof GameCard>[0];
  /** A final game as a board; `extra` changes it, and `without` leaves parts of it out. */
  const board = (extra: Partial<Props> = {}, without: readonly (keyof Props)[] = []) => {
    const props: Props = {
      home: { name: 'Hawks', score: 61, color: '#ff0000' },
      away: { name: arabicName, score: 55 },
      status: 'final',
      whenText: 'Sat 9:00',
      placeText: 'Central Gym, Court 1',
      numberText: 'Game 7',
      detailsHref: '/x/games/1',
      linkText: `${arabicName} against Hawks, final, 55 to 61`,
      labels,
      layout: 'board',
      ...extra,
    };
    const kept = Object.fromEntries(
      Object.entries(props).filter(([key]) => !without.includes(key as keyof Props)),
    ) as Props;
    return render(createElement(GameCard, kept));
  };

  it('has an emblem and a name on each side and the score between, away team first', () => {
    const html = board();
    expect(html).toContain(
      '<article class="ui-game-card" data-status="final" data-layout="board">',
    );
    expect(html.match(/class="ui-game-side"/g)).toHaveLength(2);
    expect(html.match(/<svg class="ui-emblem"/g)).toHaveLength(2);
    expect(html).not.toContain('ui-team-chip');
    expect(html).toContain(`<span class="ui-game-team-name" dir="auto">${arabicName}</span>`);
    expect(html).toContain('--team-color:#ff0000');
    expect(html).toMatch(
      /<p class="ui-game-score"><span>55<\/span><span class="ui-game-score-colon" aria-hidden="true">:<\/span> <span data-winner="true">61<\/span><\/p>/,
    );
    expect(html.indexOf(arabicName)).toBeLessThan(html.indexOf('ui-game-score'));
    expect(html.indexOf('ui-game-score')).toBeLessThan(html.indexOf('>Hawks<'));
    // A quiet line above (which game, when, its state) and below (where).
    expect(html).toContain(
      '<span class="ui-game-number">Game 7</span><span class="ui-game-when">Sat 9:00</span>',
    );
    expect(html).toContain('<span class="ui-game-state">Final</span>');
    expect(html).toContain(
      '<footer class="ui-game-foot"><span class="ui-game-place" dir="auto">Central Gym, Court 1</span></footer>',
    );
    expect(board({}, ['placeText'])).not.toContain('ui-game-foot');
  });

  it('is still one link, whole, with its hidden words for screen readers', () => {
    const html = board();
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(
      `<a class="ui-game-link" href="/x/games/1"><span dir="auto">${arabicName} against Hawks, final, 55 to 61</span></a>`,
    );
    expect(board({}, ['detailsHref'])).not.toContain('<a ');
  });

  it('marks the winner in words, by weight and by a bar under its score: never by color alone', () => {
    const html = board();
    expect(html.match(/Winner/g)).toHaveLength(1);
    expect(html).toMatch(
      /<div class="ui-game-side" data-winner="true"><svg class="ui-emblem"[^>]*style="--team-color:#ff0000">.*?<\/svg><span class="ui-game-team-name" dir="auto">Hawks<\/span><span class="ui-visually-hidden">Winner<\/span><\/div>/,
    );
    const flat = css.replace(/\s+/g, ' ');
    expect(flat).toContain(
      ".ui-game-side[data-winner='true'] .ui-game-team-name { font-weight: 700; }",
    );
    expect(flat).toContain(
      ".ui-game-score > [data-winner='true'] { border-block-end-color: currentColor; font-weight: 600; }",
    );
    // A level game, a live one and one still to play have no winner.
    for (const html of [
      board({ home: { name: 'Hawks', score: 55 } }),
      board({ status: 'live' }),
      board({ status: 'scheduled' }),
    ]) {
      expect(html).not.toContain('data-winner');
      expect(html).not.toContain('Winner');
    }
  });

  it('shows "VS" until there is a score, and the score while a game is played and after', () => {
    for (const status of ['scheduled', 'postponed', 'cancelled'] as const) {
      const html = board({ status });
      expect(html, status).toContain('<p class="ui-game-versus">vs</p>');
      expect(html, status).not.toContain('ui-game-score');
    }
    const live = board({ status: 'live' });
    expect(live).toContain('ui-live');
    expect(live).toContain('<span>55</span>');
    expect(live).not.toContain('ui-game-versus');
    // A game marked final with no score yet has nothing to compare: "VS".
    expect(board({ home: { name: 'Hawks', score: null } })).toContain('ui-game-versus');
    expect(board({ status: 'forfeit', away: { name: 'Owls', score: 0 } })).toContain(
      '<span>0</span>',
    );
  });

  it('sets a score in lining, even-width figures, the largest thing in its card', () => {
    expect(css).toMatch(
      /\.ui-game-score \{[^}]*font-family: var\(--font-score\);[^}]*font-size: var\(--text-28\);[^}]*font-variant-numeric: lining-nums tabular-nums;/,
    );
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] \.ui-game-team-name \{[^}]*font-size: var\(--text-18\);/,
    );
    expect(css).toMatch(/\.ui-game-versus \{[^}]*font-size: var\(--text-14\);/);
  });

  it('says a quiet word of its own for a game whose start has passed with no result', () => {
    const html = board({ status: 'scheduled', note: 'Awaiting result' });
    expect(html).toContain('<span class="ui-game-state" data-kind="quiet">Awaiting result</span>');
    // The word is for a game still marked to be played; a state's own pill wins.
    expect(board({ status: 'postponed', note: 'Awaiting result' })).not.toContain(
      'Awaiting result',
    );
    // The compact card says it too.
    expect(
      render(
        createElement(GameCard, {
          home: { name: 'Hawks', score: null },
          away: { name: 'Owls', score: null },
          status: 'scheduled',
          whenText: 'Sat 9:00',
          note: 'Awaiting result',
          labels,
        }),
      ),
    ).toContain('data-kind="quiet">Awaiting result</span>');
  });

  it('stands two teams one over the other where they cannot sit side by side', () => {
    expect(isLongName('Owls')).toBe(false);
    expect(isLongName('North Side Hawks')).toBe(false);
    // A single long word, and a long name of short words.
    expect(isLongName('Trailblazerettes')).toBe(true);
    expect(isLongName('The Northside Community Thunderbolts')).toBe(true);
    expect(board()).not.toContain('data-names');
    expect(board({ home: { name: 'Trailblazerettes', score: 61 } })).toContain('data-names="long"');
    // The card is the measure: narrower than any two names need, or than a long one needs.
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] \{[^}]*container-type: inline-size;/,
    );
    expect(css).toMatch(
      /@container \(max-width: 12\.99rem\) \{\s*\.ui-game-board \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /@container \(max-width: 21\.99rem\) \{\s*\.ui-game-card\[data-names='long'\] \.ui-game-board \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    // A word too long even for the whole card is broken at a syllable, not cut off.
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] \.ui-game-team-name \{[^}]*overflow-wrap: break-word;\s*hyphens: auto;/,
    );
  });

  it('lays boards two across from a tablet up, and a board left over takes the row', () => {
    const wide = css.slice(
      css.indexOf("@media (min-width: 48rem) {\n  .ui-card-grid[data-layout='board']"),
    );
    expect(wide.startsWith('@media')).toBe(true);
    expect(wide).toMatch(
      /\.ui-card-grid\[data-layout='board'\]\[data-across='two'\] \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(wide).toMatch(
      /\.ui-card-grid\[data-layout='board'\]\[data-across='two'\] > li:last-child:nth-child\(odd\) \{\s*grid-column: 1 \/ -1;/,
    );
    expect(css).toMatch(
      /\.ui-card-grid\[data-layout='board'\] \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
  });

  it('picks out the game being played now', () => {
    expect(board({ status: 'live', featured: true })).toContain('data-featured="true"');
    expect(board()).not.toContain('data-featured');
    // Larger figures only where its card has room for them and for both names.
    expect(css).toMatch(
      /@container \(min-width: 25rem\) \{\s*\.ui-game-card\[data-featured='true'\] \.ui-game-score \{\s*font-size: var\(--text-48\);/,
    );
  });
});

describe('the band near the foot of a page', () => {
  it('is a phrase, a sentence and one button', () => {
    const html = render(
      createElement(CallBand, {
        title: 'Every team has a story.',
        text: 'Rosters and results.',
        action: { href: '/x/teams', label: 'Meet the teams' },
      }),
    );
    expect(html).toContain('<h2>Every team has a story.</h2><p>Rosters and results.</p>');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(
      '<a class="ui-button" data-kind="pop" data-arrow="true" href="/x/teams">Meet the teams</a>',
    );
    expect(css).toMatch(
      /\.ui-call-band \{[^}]*var\(--color-band\)[^}]*color: var\(--color-on-band\);/,
    );
  });
});

describe('color where the eye should land (C-16)', () => {
  // The highlight itself is still spent only on the Live marker and the winner's score
  // (display.test.ts). The color the eye lands on is worked out from the league's design
  // (packages/site): this is everything that is drawn in it.
  const usedBy = (name: string) =>
    [...css.matchAll(/([^{}]+){([^{}]*)}/g)]
      .filter((m) => (m[2] ?? '').includes(`var(${name})`))
      .map((m) => (m[1] ?? '').trim().replace(/\s+/g, ' '))
      .sort();

  it('on the page: a big number, a score, a team’s place, a way on, and the lines that frame them', () => {
    expect(usedBy('--color-pop')).toEqual(
      [
        '.ui-more',
        '.ui-stat-strip',
        '.ui-stat dd',
        '.ui-game-score',
        ".ui-game-card[data-layout='board']:has(.ui-game-link):hover",
        ".ui-game-card[data-featured='true']",
        ".ui-standings[data-emblems='true'] tbody td.ui-num:first-child",
        '.ui-team-card-figure',
      ].sort(),
    );
  });

  it('on a band: the kicker, the second line of the title, the one button and the pattern', () => {
    expect(usedBy('--color-band-pop')).toEqual(
      [
        '.ui-hero',
        '.ui-hero-art',
        '.ui-hero-art text',
        '.ui-hero .ui-kicker',
        '.ui-hero-title-pop',
        ".ui-root .ui-button[data-kind='pop']",
        '.ui-call-band',
      ].sort(),
    );
  });

  it('never as running text, and never on a picker', () => {
    for (const name of ['--color-pop', '--color-band-pop']) {
      for (const selector of usedBy(name)) {
        expect(selector).not.toMatch(/picker|toolbar|table td(?!\.ui-num)|\bp\b/);
      }
    }
  });

  it('a band keeps its focus ring in its own words’ color', () => {
    expect(css).toMatch(
      /\.ui-root \.ui-hero :focus-visible,\s*\.ui-root \.ui-call-band :focus-visible \{\s*outline-color: var\(--color-on-band\);/,
    );
  });
});
