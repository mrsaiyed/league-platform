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
  LeaderSpot,
  PageHead,
  Scoreboard,
  Section,
  SortableStatsTable,
  StandingsTable,
  StatStrip,
  TeamCard,
  displayCss,
  initialOf,
  lettersWide,
  listRoom,
  nameMeasure,
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

describe('the head of an inner page', () => {
  it('is a kicker, a phrased title and one sentence, like a section of the home page', () => {
    const html = render(
      createElement(PageHead, {
        title: 'The standings.',
        kicker: 'Fall 2026',
        sub: 'Where every team stands after each game.',
      }),
    );
    expect(html).toContain('<header class="ui-page-head" data-phrased="true">');
    expect(html).toContain(
      '<p class="ui-kicker">Fall 2026</p><h1 dir="auto">The standings.</h1><p class="ui-page-sub">Where every team stands after each game.</p>',
    );
    expect(html).not.toContain('ui-eyebrow');
    expect(html.match(/<h1/g)).toHaveLength(1);
    // Without a kicker the head is as it was: the small label is an eyebrow.
    const plain = render(createElement(PageHead, { title: 'Owls', eyebrow: 'Fall 2026' }));
    expect(plain).toContain('<header class="ui-page-head">');
    expect(plain).toContain('<p class="ui-eyebrow">Fall 2026</p>');
    expect(css).toMatch(
      /\.ui-page-head\[data-phrased='true'\] \{\s*gap: var\(--step-3\);\s*margin-block: var\(--step-4\) var\(--step-6\);/,
    );
  });
});

describe('a picker’s field on a phone', () => {
  it('stays inside the page: it carries no margin of its own beside its label', () => {
    // The plain rule gives a field after its label a step's margin; a picker has its own
    // gap, and on a phone its field fills its column, so the margin pushed it 8 past the
    // page's edge (the schedule and statistics pages at 390).
    expect(css).toMatch(
      /\.ui-root :where\(label \+ input, label \+ select, label \+ textarea\) \{\s*margin-inline-start: var\(--step-2\);/,
    );
    expect(css).toMatch(/\.ui-picker select \{\s*margin: 0;\s*max-inline-size: 100%;/);
    const phone = css.slice(css.indexOf('@media (max-width: 39.99rem) {\n  .ui-toolbar'));
    expect(phone).toMatch(/\.ui-toolbar \.ui-picker select \{\s*inline-size: 100%;/);
  });
});

describe('a picker’s arrow', () => {
  const rule = /\.ui-picker select \{([^}]*)\}/.exec(css)?.[1] ?? '';
  it('is the product’s own fine arrow, not the browser’s, in the field’s own text color', () => {
    expect(rule).toMatch(/appearance: none;/);
    // Two strokes that meet, each as heavy as the product's heavier line; no picture file,
    // so the arrow takes the color of any design, and of the header.
    expect(rule).toMatch(
      /background-image:\s*linear-gradient\(\s*45deg,[\s\S]*linear-gradient\(\s*135deg,/,
    );
    expect(rule.match(/currentColor calc\(50% - var\(--line-heavy\) \/ 2\)/g)).toHaveLength(2);
    expect(rule.match(/currentColor calc\(50% \+ var\(--line-heavy\) \/ 2\)/g)).toHaveLength(2);
    expect(rule).not.toMatch(/url\(|#[0-9a-f]{3,8}\b/i);
    expect(rule).toMatch(/background-repeat: no-repeat;/);
    expect(rule).toMatch(
      /background-size: calc\(var\(--step-3\) \/ 2\) calc\(var\(--step-3\) \/ 2\);/,
    );
  });
  it('has room kept for it at the field’s end, and stands at the other end read from the right', () => {
    expect(rule).toMatch(
      /padding-inline-end: calc\(var\(--step-3\) \+ var\(--step-3\) \+ var\(--step-2\)\);/,
    );
    expect(rule).toMatch(
      /background-position:\s*calc\(100% - var\(--step-3\) - var\(--step-3\) \/ 2\) 50%,\s*calc\(100% - var\(--step-3\)\) 50%;/,
    );
    expect(css).toMatch(
      /\[dir='rtl'\] \.ui-picker select \{\s*background-position:\s*var\(--step-3\) 50%,\s*calc\(var\(--step-3\) \+ var\(--step-3\) \/ 2\) 50%;/,
    );
    // Nothing after it paints the field's whole background again and wipes the arrow out.
    const after = css.slice(css.indexOf("[dir='rtl'] .ui-picker select"));
    expect(after).not.toMatch(/\.ui-picker[^{]*select[^{]*\{[^}]*background:/);
  });
  it('gives the browser’s own arrow back where colors are forced (high contrast)', () => {
    // A forced-colors page draws no background picture that is not a file: the drawn arrow
    // would be gone, and with the browser's arrow switched off the field would be a bare
    // box. The rule comes after the arrow's own, with the same strength, so it wins there.
    const forced = /@media \(forced-colors: active\) \{\s*\.ui-picker select \{([^}]*)\}\s*\}/.exec(
      css,
    );
    expect(forced).not.toBeNull();
    expect(forced?.[1]).toMatch(/appearance: auto;/);
    expect(forced?.[1]).toMatch(/padding-inline-end: var\(--step-3\);/);
    expect(forced?.[1]).toMatch(/background-image: none;/);
    expect(css.indexOf('@media (forced-colors: active)')).toBeGreaterThan(
      css.indexOf("[dir='rtl'] .ui-picker select"),
    );
    // The field's ordinary padding is that same step.
    expect(css).toMatch(
      /\.ui-picker select,\s*\.ui-picker button \{[^}]*padding-inline: var\(--step-3\);/,
    );
  });
});

describe('the heavier line', () => {
  it('is named once: no stylesheet of the pieces writes a line of 2 pixels itself', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(bare).not.toMatch(/\b2px solid/);
    expect(bare).not.toMatch(/(?:block-size|inline-size|thickness): 2px/);
    expect(bare).not.toMatch(/underline 2px/);
    expect(bare.match(/var\(--line-heavy\)/g)?.length ?? 0).toBeGreaterThan(12);
  });
});

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
    // A short rule, then the label: small, in capitals, widely spaced. The rule is in the
    // league's color of decoration (its gold, where it has one), which need not be read;
    // on a band it is in the label's own color.
    expect(css).toMatch(
      /\.ui-kicker \{[^}]*font-size: var\(--text-12\);[^}]*letter-spacing: 0\.2em;[^}]*text-transform: uppercase;/,
    );
    expect(css).toMatch(
      /\.ui-kicker::before \{[^}]*inline-size: var\(--step-5\);\s*block-size: 1px;\s*background: var\(--color-ornament\);/,
    );
    expect(css).toMatch(/\.ui-hero \.ui-kicker::before \{\s*background: currentColor;/);
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

  it('draws its mark only on a laptop: on a phone nothing of it passes under words or a button', () => {
    // Put away by its own rule, and shown only from the width where the words leave the
    // far side of the band free.
    expect(css).toMatch(/\.ui-hero-art \{\s*display: none;/);
    const shown = [
      ...css.matchAll(
        /@media \(min-width: ([\d.]+)rem\) \{[^@]*?\.ui-hero-art \{\s*display: block;/g,
      ),
    ];
    expect(shown.map((m) => m[1])).toEqual(['64']);
    expect(css.slice(0, css.indexOf('@media (min-width: 64rem) {\n  .ui-hero-art'))).not.toMatch(
      /\.ui-hero-art \{[^}]*display: block;/,
    );
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
    // The initial is the whole character a reader sees (found by the code review, L4): a
    // letter with its accent written as two parts, a flag, a picture made of several.
    expect(initialOf('e\u{301}toiles')).toBe('e\u{301}');
    expect(initialOf('\u{1F1E8}\u{1F1E6} Canada')).toBe('\u{1F1E8}\u{1F1E6}');
    expect(initialOf('\u{1F469}\u{200D}\u{1F467} Family')).toBe('\u{1F469}\u{200D}\u{1F467}');
    expect(initialOf('  owls')).toBe('o');
    expect(initialOf('   ')).toBe('');
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
    // How much of the color fills the shield is the design's: more on a white panel than
    // on a dark one, so a shield has the same strength on either.
    expect(css).toMatch(
      /\.ui-emblem-shield \{\s*fill: color-mix\(in srgb, var\(--emblem-color\) var\(--emblem-strength, 30%\), transparent\);\s*stroke: currentColor;/,
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
        `<th scope="row" class="ui-team-cell"><svg class="ui-emblem" data-size="small"[^>]*style="--team-color:#663399">.*?</svg><span dir="auto"><span class="ui-team-name">${arabicName}</span></span>`,
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

  it('a standings table in a narrow box sets its cells a step closer, so a short one shows whole', () => {
    // The faces are now the designs' own, some wider than a phone's: a division's few
    // columns on the home page must still fit a phone with nothing to scroll to. Only a
    // standings table: a statistics table's headings are buttons a thumb taps, and keep
    // their room.
    expect(css).toMatch(
      /@container \(max-width: 26rem\) \{\s*\.ui-standings th,\s*\.ui-standings td \{\s*padding-inline: var\(--step-2\);/,
    );
    expect(css).not.toMatch(/@container[^{]*\{\s*\.ui-table th,/);
    // The first and last cells keep their distance from the box's edges.
    expect(css).toMatch(/\.ui-table tr > :first-child \{\s*padding-inline-start: var\(--step-4\);/);
    expect(css).toMatch(/\.ui-table tr > :last-child \{\s*padding-inline-end: var\(--step-4\);/);
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
      /<div class="ui-game-side" data-winner="true"><span class="ui-game-side-team"><svg class="ui-emblem"[^>]*style="--team-color:#ff0000">.*?<\/svg><span class="ui-game-team-name" dir="auto">Hawks<\/span><\/span><span class="ui-visually-hidden">Winner<\/span><span class="ui-game-side-score" aria-hidden="true">61<\/span><\/div>/,
    );
    const flat = css.replace(/\s+/g, ' ');
    expect(flat).toContain(
      ".ui-game-side[data-winner='true'] .ui-game-team-name { font-weight: 700; }",
    );
    // The bar is in the league's color of decoration (its gold, where it has one): it need
    // not be read, the figure over it is.
    expect(flat).toContain(
      ".ui-game-score > [data-winner='true'] { border-block-end-color: var(--color-ornament); font-weight: 600; }",
    );
    expect(flat).toContain(
      ".ui-game-side[data-winner='true'] .ui-game-side-score { font-weight: 600; text-decoration: underline var(--line-heavy) var(--color-ornament); text-underline-offset: 0.2em; }",
    );
    // Once decided, the other score is in the page's own text color, wherever it stands.
    expect(flat).toMatch(
      /\.ui-game-side:not\(\[data-winner\]\) \.ui-game-side-score \{ color: var\(--color-text\); font-weight: 400; \}/,
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
    // A side needs room for the longer line of a name's best break into two, so a name
    // of several words takes two lines and no more. A name breaks only between words, so
    // that is not always half of it: "North Side Hawks" is 10 and 5, never 8 and 8; the
    // long one is "The Northside" over "Community Thunderbolts", 22. One word is whole.
    expect(nameMeasure('Owls')).toBe(4);
    expect(nameMeasure('  North   Side Hawks ')).toBe(10);
    expect(nameMeasure('Trailblazerettes')).toBe(16);
    expect(nameMeasure('The Northside Community Thunderbolts')).toBe(22);
    expect(nameMeasure('Red Wings')).toBe(5);
    expect(nameMeasure('A Very Long Team Name Indeed')).toBe(16);
    expect(nameMeasure(arabicName)).toBe(7);
    expect(nameMeasure('')).toBe(0);
    // A letter of Chinese, Japanese or Korean, or a picture, is about two Latin letters
    // wide, and a mark that sits on another letter takes no room (the code review, L3).
    expect(lettersWide('Owls')).toBe(4);
    expect(lettersWide('猛虎')).toBe(4);
    expect(lettersWide('タイガース')).toBe(10);
    expect(lettersWide('호랑이')).toBe(6);
    expect(lettersWide('e\u{301}')).toBe(1);
    expect(lettersWide('\u{1F985}')).toBe(2);
    expect(nameMeasure('上海猛虎篮球队')).toBe(14);
    expect(nameMeasure('北京 猛虎')).toBe(4);
    expect(
      board({ home: { name: '上海猛虎篮球队', score: 61 }, away: { name: 'Owls', score: 55 } }),
    ).toContain('style="--letters:14;--figures:4"');
    // The board is told the longer of its two names, and how many figures its score has.
    expect(board()).toContain(
      '<div class="ui-game-board" data-scored="true" style="--letters:7;--figures:4">',
    );
    expect(
      board({
        home: { name: 'Trailblazerettes', score: 101 },
        away: { name: 'Owls', score: 98 },
      }),
    ).toContain('style="--letters:16;--figures:5"');
    expect(board({ status: 'scheduled' })).toContain(
      '<div class="ui-game-board" style="--letters:7">',
    );
    // From those it works out the width the teams need side by side: two sides at the
    // heading face's letter width, the middle ("VS", or the score's figures) and the gaps.
    // The name's size is a value of the board's, so the sum is right where names are set
    // larger (the code review, L2).
    expect(css).toMatch(
      /\.ui-game-board \{[^}]*--board-name: var\(--text-18\);\s*--board-side: calc\(var\(--letters, 8\) \* var\(--heading-letter, 0\.6\) \* var\(--board-name\)\);[^}]*--board-needs: calc\(2 \* var\(--board-side\) \+ var\(--board-middle\) \+ 2 \* var\(--board-gap\)\);\s*--board-short: calc\(\(var\(--board-needs\) - 100cqi\) \* 999\);\s*--board-room: calc\(\(100cqi - var\(--board-needs\)\) \* 999\);[^}]*flex-wrap: wrap;[^}]*container: board \/ inline-size;/,
    );
    expect(css).toMatch(
      /\.ui-game-board:is\(\[data-scored='true'\], \[data-room='scored'\]\) \{\s*--board-middle: calc\(var\(--figures, 4\) \* 0\.65 \* var\(--board-figure\) \+ var\(--step-5\)\);/,
    );
    // Narrower than that, each team takes a row of its own; wide enough, the sides share
    // what the middle leaves.
    expect(css).toMatch(/\.ui-game-side \{[^}]*flex: 1 1 var\(--board-short\);/);
    // A side is a measure of its own: what stands in it is laid out by its share of the
    // board, so nothing in it does a sum with the board's width (inside a side, 100cqi
    // would be the side's width and the sum would be wrong).
    expect(css).toMatch(/\.ui-game-side \{[^}]*container: side \/ inline-size;/);
    const inSide = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) =>
      /\.ui-game-side-team|\.ui-game-side-score|\.ui-game-team-name|\.ui-emblem/.test(
        rule[1] ?? '',
      ),
    );
    expect(inSide.length).toBeGreaterThan(8);
    for (const rule of inSide) expect(rule[2], rule[1]).not.toMatch(/cqi|--board-(?:short|room)/);
    // Side by side (the plain rules): the name under the emblem, both in the middle, and
    // no score of its own.
    expect(css).toMatch(
      /\.ui-game-side-team \{\s*display: flex;\s*flex: 1 1 auto;\s*flex-direction: column;\s*align-items: center;[^}]*text-align: center;/,
    );
    expect(css).toMatch(
      /\.ui-game-side-score \{\s*display: none;\s*flex: none;\s*color: var\(--color-pop\);\s*font-family: var\(--font-score\);[^}]*font-variant-numeric: lining-nums tabular-nums;/,
    );
    // Two rows: a side that has the whole board (side by side it has less than half; the
    // measure is three quarters of the board) sets its team in a line from the start of
    // the row, the name's lines from the start too, like the name in the other row, and
    // draws its own score at the end.
    expect(css).toMatch(
      /@container side \(min-width: 75cqi\) \{\s*\.ui-game-side-team \{\s*flex-direction: row;\s*gap: var\(--step-3\);\s*text-align: start;\s*\}\s*\.ui-game-card\[data-layout='board'\] \.ui-game-side \.ui-emblem \{\s*block-size: var\(--step-6\);\s*\}\s*\.ui-game-side-score \{\s*display: block;\s*\}\s*\}/,
    );
    expect(css).not.toMatch(/\.ui-game-side-team \{[^}]*text-align: (?!center|start)/);
    // What stood between the teams takes no room at all when the board is two rows.
    expect(css).toMatch(
      /\.ui-game-middle > \* \{\s*flex: none;\s*max-inline-size: clamp\(0px, var\(--board-room\), 20rem\);\s*max-block-size: clamp\(0px, var\(--board-room\), 6rem\);\s*overflow: hidden;/,
    );
    // A score is said once to a screen reader: the one between the teams.
    const scored = board();
    expect(scored.match(/class="ui-game-side-score" aria-hidden="true"/g)).toHaveLength(2);
    expect(scored).toMatch(/<div class="ui-game-middle"><p class="ui-game-score">/);
    expect(board({ status: 'scheduled' })).not.toContain('ui-game-side-score');
    expect(board({ status: 'scheduled' })).toContain(
      '<div class="ui-game-middle"><p class="ui-game-versus">vs</p></div>',
    );
    // Where a card is wide its figures and gaps are larger, and the sum knows it. The
    // measure named "card" is the card's top line and its middle part, each as wide as
    // the card's inside (the next test says why the card itself is not one).
    expect(css.replace(/\s+/g, ' ')).toContain(
      ".ui-game-card[data-layout='board'] .ui-game-meta, .ui-game-body { min-inline-size: 0; container: card / inline-size; }",
    );
    expect(css).toMatch(
      /@container card \(min-width: 26rem\) \{\s*\.ui-game-board \{\s*--board-gap: var\(--step-5\);\s*--board-figure: var\(--text-36\);\s*gap: var\(--step-2\) var\(--step-5\);/,
    );
    // A name breaks between its words and nowhere else: a short word never breaks, and a
    // word too long even for a line of its own is cut short with "…", never split.
    const name =
      /\.ui-game-card\[data-layout='board'\] \.ui-game-team-name \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(name).toMatch(
      /overflow-wrap: normal;\s*hyphens: manual;\s*overflow-x: clip;\s*text-overflow: ellipsis;/,
    );
    expect(name).toMatch(/flex: 0 1 auto;\s*min-inline-size: 0;\s*max-inline-size: 100%;/);
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.ui-game-(?:board|side)|data-layout='board'/.test(rule[1] ?? '')) continue;
      expect(rule[2], rule[1]).not.toMatch(
        /overflow-wrap: (?:break-word|anywhere)|word-break: break|hyphens: auto/,
      );
    }
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

  it('on a laptop ends an odd list with three boards in a row, never one stretched across the page', () => {
    const laptop = css.slice(
      css.indexOf("@media (min-width: 64rem) {\n  .ui-card-grid[data-layout='board']"),
    );
    expect(laptop.startsWith('@media')).toBe(true);
    const grid = String.raw`\.ui-card-grid\[data-layout='board'\]\[data-across='two'\]`;
    // Six narrow columns: a board of a pair takes three, a board of the last three two.
    expect(laptop).toMatch(
      new RegExp(String.raw`${grid} \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);`),
    );
    expect(laptop).toMatch(new RegExp(String.raw`${grid} > li \{\s*grid-column: span 3;`));
    expect(laptop).toMatch(
      new RegExp(
        String.raw`${grid} > li:nth-last-child\(3\):nth-child\(odd\),\s*${grid} > li:nth-last-child\(3\):nth-child\(odd\) ~ li \{\s*grid-column: span 2;`,
      ),
    );
    // Only a board that is the whole list has the row to itself, and there its two teams
    // are kept within reach of each other in the middle of the card.
    expect(laptop).toMatch(
      new RegExp(String.raw`${grid} > li:only-child \{\s*grid-column: 1 \/ -1;`),
    );
    expect(css).toMatch(
      /\.ui-game-board \{[^}]*inline-size: 100%;\s*max-inline-size: calc\(10 \* var\(--step-8\)\);\s*margin-inline: auto;/,
    );
  });

  it('stands the shields and names of a row of cards on one line', () => {
    // By itself a card's top line takes what it needs and its middle the rest.
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] \{\s*grid-template-rows: auto 1fr auto;/,
    );
    // Side by side, the cards of a row share the heights of their three parts through the
    // list's grid: each card lends the list its three rows (a card is three rows of it),
    // so a card whose pill took a second line gives its whole row that top line and no
    // board in the row stands lower than its neighbors.
    const shared = css.slice(css.indexOf('@supports (grid-template-rows: subgrid) {'));
    expect(shared.startsWith('@supports')).toBe(true);
    const list = String.raw`\.ui-card-grid\[data-layout='board'\]:is\(\[data-across='two'\], \[data-across='pair'\]\)`;
    expect(shared).toMatch(
      new RegExp(
        String.raw`^@supports \(grid-template-rows: subgrid\) \{\s*@media \(min-width: 48rem\) \{\s*${list} \{\s*row-gap: 0;\s*margin-block-end: calc\(-1 \* var\(--step-5\)\);\s*\}\s*${list} > li \{\s*grid-row: span 3;\s*grid-template-rows: subgrid;\s*margin-block-end: var\(--step-5\);\s*\}\s*${list}\s*> li\s*> \.ui-game-card \{\s*grid-row: 1 \/ -1;\s*grid-template-rows: subgrid;`,
      ),
    );
    // A browser does not let a box that is a measure (a container for its pieces' sizes)
    // share rows: so neither the card nor the list's item is ever one. An earlier rule
    // that left the card a measure was ignored by the browser and left a row unlevel.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = (rule[1] ?? '').split(',').map((s) => s.trim());
      const onCard = selectors.some((s) => /(?:\.ui-game-card(?:\[[^\]]*\])*|> li)$/.test(s));
      if (onCard) expect(rule[2], rule[1]).not.toMatch(/container(?:-type)?:/);
    }
    // Inside a board the two sides begin at its top, and a board taller than its teams
    // (its row's tallest neighbor sets the height) keeps them at the top: so one card's
    // two-line name never lowers its neighbors' shields.
    expect(css).toMatch(/\.ui-game-board \{[^}]*align-items: center;\s*align-content: flex-start;/);
    expect(css).toMatch(/\.ui-game-side \{[^}]*align-self: flex-start;\s*align-items: center;/);
    // A card has exactly the three parts the rows are for (its top line, its middle, which
    // holds the board, and its place), and its link lies over them.
    const html = board();
    expect(html).toMatch(
      /^<article[^>]*><header class="ui-game-meta">.*<\/header><div class="ui-game-body"><div class="ui-game-board".*<\/div><\/div><footer class="ui-game-foot">.*<\/footer><a class="ui-game-link"/,
    );
    expect(css).toMatch(/\.ui-game-link \{\s*position: absolute;/);
  });

  it('draws every board of a list the same way: the list tells each the room all of them need', () => {
    const games = [
      {
        status: 'final' as const,
        home: { name: 'Owls', score: 101 },
        away: { name: 'Hawks', score: 98 },
      },
      {
        status: 'scheduled' as const,
        home: { name: 'North Side Hawks', score: null },
        away: { name: 'Owls', score: null },
      },
    ];
    // The longest name of the list (its better break is 10 letters), the longest score.
    expect(listRoom(games)).toEqual({ letters: 10, figures: 5 });
    expect(listRoom(games.slice(1))).toEqual({ letters: 10 });
    expect(listRoom([])).toEqual({ letters: 0 });
    // A board with no score of its own still reckons with the list's score, and says so.
    expect(board({ status: 'scheduled', room: { letters: 10, figures: 5 } })).toContain(
      '<div class="ui-game-board" data-room="scored" style="--letters:10;--figures:5">',
    );
    expect(board({ room: { letters: 10, figures: 5 } })).toContain(
      '<div class="ui-game-board" data-scored="true" style="--letters:10;--figures:5">',
    );
    // In a list with no score anywhere, a board reckons with "VS" alone.
    expect(board({ status: 'scheduled', room: { letters: 10 } })).toContain(
      '<div class="ui-game-board" style="--letters:10">',
    );
    expect(css).toMatch(
      /\.ui-game-board:is\(\[data-scored='true'\], \[data-room='scored'\]\) \{\s*--board-middle: calc\(var\(--figures, 4\) \* 0\.65 \* var\(--board-figure\) \+ var\(--step-5\)\);/,
    );
  });

  it('keeps a state’s pill quiet or soft, and in one place on a phone', () => {
    const flat = css.replace(/\s+/g, ' ');
    // "Final" is as quiet as "Awaiting result": on a card and on a game's big board.
    expect(flat).toContain(
      ".ui-game-state[data-kind='quiet'], .ui-game-card[data-status='final'] .ui-game-state, .ui-scoreboard[data-pill='quiet'] .ui-game-state { border-color: var(--color-line); background: transparent; color: var(--color-muted); font-weight: 600; }",
    );
    // Put off, called off, forfeited: a soft tint of the main color, no stronger than the
    // tint every text is fitted to, the accent for its words, and an edge at a line's
    // strength (DESIGN.md line 17: 12 to 25 percent). The same look on the big board and
    // on a round's "1 game postponed".
    expect(flat).toContain(
      ".ui-game-card:is([data-status='postponed'], [data-status='cancelled'], [data-status='forfeit']) .ui-game-state, .ui-scoreboard:not([data-pill='quiet']) .ui-game-state, .ui-group .ui-group-mark[data-kind='note'] { border-color: color-mix(in srgb, var(--color-accent) 25%, transparent); background: var(--color-tint); color: var(--color-accent-text); }",
    );
    // No pill anywhere has a full-strength edge or the page's text color for its words.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.ui-game-state|ui-group-mark\[data-kind='note'\]/.test(rule[1] ?? '')) continue;
      expect(rule[2], rule[1]).not.toMatch(/border-color: var\(--color-line-strong\)/);
      for (const mix of (rule[2] ?? '').matchAll(/border-color: color-mix\([^)]* (\d+)%/g)) {
        expect(Number(mix[1]), rule[1]).toBeLessThanOrEqual(25);
      }
    }
    // The big board marks a plain "Final" for the quiet look; a state named in other
    // words keeps the soft one.
    const labels = {
      scoreboard: 'Scoreboard',
      home: 'Home',
      away: 'Away',
      live: 'Live',
      final: 'Final',
      winner: 'Winner',
    };
    const big = (extra: Partial<Parameters<typeof Scoreboard>[0]>) =>
      render(
        createElement(Scoreboard, {
          home: { name: 'Hawks', score: 61 },
          away: { name: 'Owls', score: 55 },
          state: 'final',
          labels,
          ...extra,
        }),
      );
    expect(big({})).toContain('data-state="final" data-pill="quiet"');
    expect(big({})).toContain('<span class="ui-game-state">Final</span>');
    expect(big({ stateText: 'Forfeit' })).not.toContain('data-pill');
    expect(big({ state: 'other', stateText: 'Postponed' })).not.toContain('data-pill');
    expect(big({ state: 'live' })).not.toContain('data-pill');
    // Only in a card as narrow as a small phone's does the pill always take its own line
    // under the date; a phone of 390 and three across on a laptop hold both on one line.
    expect(css).toMatch(
      /@container card \(max-width: 16\.99rem\) \{\s*\.ui-game-card\[data-layout='board'\] \.ui-game-about \{\s*flex-basis: 100%;/,
    );
  });

  it('makes the winner’s score the heavier one in every design, on a card and on the big board', () => {
    const flat = css.replace(/\s+/g, ' ');
    // The weight a rule sets: the rule whose selector is exactly this one.
    const weightOf = (selector: string) => {
      const rule = [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
        (m) => (m[1] ?? '').trim() === selector && /font-weight:/.test(m[2] ?? ''),
      );
      expect(rule, selector).toBeDefined();
      return /font-weight: ([^;]+);/.exec(rule?.[2] ?? '')?.[1];
    };
    // The big board: plain numbers of the score face, not the heading face's display
    // weight (700 in the plain faces, which would have left a winner at 600 the lighter).
    const playing = weightOf('.ui-scoreboard-score');
    const winner = weightOf(".ui-scoreboard-side[data-winner='true'] .ui-scoreboard-score");
    const other = weightOf(
      ".ui-scoreboard[data-state='final'] .ui-scoreboard-side:not([data-winner='true']) .ui-scoreboard-score",
    );
    expect([playing, winner, other]).toEqual(['600', '700', '400']);
    // A card: the winner's 600 against the other's 400, in both of its drawings. A score
    // still being played is set in the display weight, which no decided score keeps.
    expect(weightOf(".ui-game-score > [data-winner='true']")).toBe('600');
    expect(weightOf(".ui-game-side[data-winner='true'] .ui-game-side-score")).toBe('600');
    expect(flat).toMatch(
      /\.ui-game-card:is\(\[data-status='final'\], \[data-status='forfeit'\]\) \.ui-game-score > span:not\(\[data-winner\], \.ui-game-score-colon\), \.ui-game-card:is\(\[data-status='final'\], \[data-status='forfeit'\]\) \.ui-game-side:not\(\[data-winner\]\) \.ui-game-side-score \{ color: var\(--color-text\); font-weight: 400; \}/,
    );
    // No rule of the big board's score takes its weight from a design value, so no face's
    // traits (packages/site, fonts.ts) can turn the order around.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!(rule[1] ?? '').includes('.ui-scoreboard-score')) continue;
      expect(rule[2], rule[1]).not.toMatch(/font-weight: var\(/);
    }
  });

  it('picks out the game being played now', () => {
    expect(board({ status: 'live', featured: true })).toContain('data-featured="true"');
    expect(board()).not.toContain('data-featured');
    // Larger figures only where its card has room for them, and the board's sum of what
    // the teams need side by side is told the larger size.
    expect(css).toMatch(
      /@container card \(min-width: 25rem\) \{\s*\.ui-game-card\[data-featured='true'\] \.ui-game-board \{\s*--board-figure: var\(--text-48\);\s*\}\s*\.ui-game-card\[data-featured='true'\] \.ui-game-score \{\s*font-size: var\(--text-48\);/,
    );
    // Its names are a step larger in a card wider still, and the sum is told that size too
    // (the code review, L2): the size and the value change in the same rule.
    expect(css).toMatch(
      /@container card \(min-width: 34rem\) \{\s*\.ui-game-card\[data-featured='true'\] \.ui-game-board \{\s*--board-name: var\(--text-22\);\s*\}\s*\.ui-game-card\[data-featured='true'\] \.ui-game-team-name \{\s*font-size: var\(--text-22\);/,
    );
    // No other rule sets a board's names at a size the sum is not told.
    const nameSizes = [
      ...css.matchAll(/([^{}]*\.ui-game-team-name) \{[^}]*font-size: var\(--(text-\d+)\)/g),
    ].map((m) => `${(m[1] ?? '').trim().replace(/\s+/g, ' ')} ${m[2]}`);
    expect(nameSizes).toEqual([
      '.ui-game-team-name text-16',
      ".ui-game-card[data-layout='board'] .ui-game-team-name text-18",
      ".ui-game-card[data-featured='true'] .ui-game-team-name text-22",
    ]);
  });

  it('never breaks its top line inside the date and time: the pill takes a line of its own', () => {
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] \.ui-game-meta \{\s*display: flex;\s*flex-wrap: wrap;\s*align-items: center;\s*justify-content: space-between;/,
    );
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] :is\(\.ui-game-number, \.ui-game-when\) \{\s*white-space: nowrap;/,
    );
    expect(css).toMatch(/\.ui-game-state \{[^}]*flex: none;[^}]*white-space: nowrap;/);
  });

  it('lifts under the pointer only for a reader who has not asked for less movement', () => {
    // The code review, L7: the only rule that moves a card is inside the guard.
    const moving = [...css.matchAll(/:hover \{[^}]*transform:/g)];
    expect(moving).toHaveLength(1);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ui-game-card\[data-layout='board'\]:has\(\.ui-game-link\):hover \{\s*transform: translateY\(-2px\);\s*\}\s*\}/,
    );
  });

  it('wears the league’s color of decoration as a fine line at its top, over one tint', () => {
    expect(css).toMatch(
      /\.ui-game-card\[data-layout='board'\] \{[^}]*background-image: linear-gradient\(120deg, var\(--card-wash\), var\(--color-panel\) 70%\);\s*border-block-start: var\(--line-heavy\) solid var\(--color-ornament-line\);/,
    );
  });
});

describe('the strip of big numbers', () => {
  const html = render(
    createElement(StatStrip, {
      label: 'This season',
      items: [
        { key: 'teams', label: 'Teams', value: '8' },
        { key: 'played', label: 'Games played', value: '24' },
      ],
    }),
  );

  it('sets its numbers in even-width figures, read against each other across the row', () => {
    expect(html).toContain('Games played');
    expect(css).toMatch(
      /\.ui-stat dd \{[^}]*color: var\(--color-pop\);[^}]*font-variant-numeric: lining-nums tabular-nums;/,
    );
  });

  it('lets a label of two words take two lines, and stands two rows of two on the narrowest phones', () => {
    // The code review, L7: at 320 a label ran into the next cell.
    expect(css).toMatch(/\.ui-stat \{[^}]*min-inline-size: 0;/);
    expect(css).toMatch(
      /\.ui-stat dt \{\s*max-inline-size: 100%;[^}]*text-wrap: balance;\s*overflow-wrap: break-word;\s*hyphens: auto;/,
    );
    expect(css).not.toMatch(/\.ui-stat dt \{[^}]*white-space: nowrap;/);
    expect(css).toMatch(
      /@media \(max-width: 22\.49rem\) \{\s*\.ui-stat-strip \{\s*grid-auto-flow: row;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });

  it('stands between two fine lines in the league’s color of decoration', () => {
    expect(css).toMatch(
      /\.ui-stat-strip \{[^}]*border-block: 1px solid var\(--color-ornament-line\);/,
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

describe('a leader, picked out', () => {
  const spot = (extra: Partial<Parameters<typeof LeaderSpot>[0]> = {}) =>
    render(
      createElement(LeaderSpot, {
        label: '01 / Points',
        value: '17.0',
        unit: 'per game',
        name: arabicName,
        detail: 'Hawks · 6 games',
        team: { name: 'Hawks', color: '#ff0000' },
        ...extra,
      }),
    );

  it('is a label, one big number, the player’s name as its title, a quiet line and the team’s shield', () => {
    const html = spot();
    expect(html).toContain('<article class="ui-spot">');
    expect(html).toContain('<p class="ui-spot-label">01 / Points</p>');
    expect(html).toContain(
      '<p class="ui-spot-figure"><span class="ui-spot-value">17.0</span><span class="ui-spot-unit">per game</span></p>',
    );
    // The name keeps its own direction, in any script, and is the card's title.
    expect(html).toContain(`<h3 class="ui-spot-name" dir="auto">${arabicName}</h3>`);
    expect(html).toContain('<p class="ui-spot-detail" dir="auto">Hawks · 6 games</p>');
    expect(html).toMatch(/<svg class="ui-emblem"[^>]*style="--team-color:#ff0000">.*>H<\/text>/);
    // A player of several teams has no one shield; a number may stand without a unit.
    expect(spot({ team: undefined })).not.toContain('ui-emblem');
    expect(spot({ unit: undefined })).not.toContain('ui-spot-unit');
    // Under a small heading inside another section the name is one level further down.
    expect(spot({ headingLevel: 4 })).toContain(
      `<h4 class="ui-spot-name" dir="auto">${arabicName}</h4>`,
    );
    // The unit is a small label, spaced as the design spaces its labels.
    expect(css).toMatch(/\.ui-spot-unit \{[^}]*letter-spacing: var\(--label-tracking\);/);
    // The number is the largest thing on the card, in the color the eye lands on.
    expect(css).toMatch(
      /\.ui-spot-value \{\s*color: var\(--color-pop\);\s*font-family: var\(--font-heading\);\s*font-size: var\(--text-48\);/,
    );
    expect(css).toMatch(/\.ui-root \.ui-spot-name \{\s*font-size: var\(--text-22\);/);
  });

  it('carries the league’s main color on the first of a row, in a band’s own fitted colors', () => {
    expect(spot({ first: true })).toContain('<article class="ui-spot" data-first="true">');
    expect(spot()).not.toContain('data-first');
    // Unless a design says otherwise (the --spot values, which a light design sets to
    // soften the card) it is a small band: the band's ground, words, quiet words and the
    // color the eye lands on there.
    const flat = css.replace(/\s+/g, ' ');
    expect(flat).toContain(
      ".ui-spot[data-first='true'] { background-color: var(--spot-ground, var(--color-band)); background-image: linear-gradient( 120deg, var(--spot-glow, var(--color-band-glow)), var(--spot-ground, var(--color-band)) ); border-color: var(--spot-edge, color-mix(in srgb, var(--color-band-pop) 28%, transparent)); color: var(--spot-words, var(--color-on-band)); }",
    );
    expect(flat).toContain(
      ".ui-spot[data-first='true'] :is(.ui-spot-label, .ui-spot-unit, .ui-spot-detail) { color: var(--spot-muted, var(--color-band-muted)); }",
    );
    expect(flat).toContain(
      ".ui-spot[data-first='true'] .ui-spot-value { color: var(--spot-pop, var(--color-band-pop)); }",
    );
    expect(css).toMatch(
      /\.ui-spot\[data-first='true'\] \.ui-emblem-letter \{\s*color: var\(--spot-letter, var\(--color-on-band\)\);/,
    );
    // On the filled card a shield keeps its team's own color: it is filled with it (most
    // of it, a little deepened), not laid thinly over the card's color, which turned a
    // green team grey on a maroon card.
    const fill =
      /\.ui-spot\[data-first='true'\] \.ui-emblem-shield \{ fill: color-mix\( in srgb, var\(--emblem-color\) var\(--spot-shield-share, (\d+)%\), var\(--spot-shield-under, var\(--color-band-deep\)\) \);/.exec(
        flat,
      );
    expect(Number(fill?.[1])).toBeGreaterThanOrEqual(75);
    // The check that the shield is never laid thinly over the card's own color, in the
    // form that holds for every design: the stylesheet itself never mixes the shield with
    // nothing on the filled card (what stands under it is a named value whose default is
    // the band's deep color). A design that names "transparent" there has also made the
    // card a panel, where a thin fill is how every shield is drawn (packages/site,
    // derived-values.test.ts checks that the two always go together).
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.ui-spot\[data-first='true'\][^{]*\.ui-emblem-shield/.test(rule[1] ?? '')) continue;
      expect(rule[2]).not.toMatch(/,\s*transparent\s*\)/);
      expect(rule[2]).toContain('var(--spot-shield-under, var(--color-band-deep))');
    }
    // Mirrored for a right-to-left page.
    expect(css).toMatch(
      /\[dir='rtl'\] \.ui-spot\[data-first='true'\] \{\s*background-image: linear-gradient\(\s*240deg,/,
    );
  });

  it('is one short row where it has a column to itself, and stands three across on a laptop', () => {
    expect(css).toMatch(/\.ui-spot \{[^}]*container: spot \/ inline-size;/);
    expect(css).toMatch(
      /@container spot \(min-width: 28rem\) \{\s*\.ui-spot-figure \{\s*grid-column: 1;[^}]*\}\s*\.ui-spot-who \{\s*grid-column: 2;/,
    );
    const wide = css.slice(
      css.indexOf("@media (min-width: 48rem) {\n  .ui-spot-row[data-across='two']"),
    );
    expect(wide.startsWith('@media')).toBe(true);
    expect(wide).toMatch(
      /\.ui-spot-row\[data-across='three'\] \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /\.ui-spot-row \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
  });
});

describe('the second landing’s smaller rules', () => {
  it('uses the big board’s width on a laptop: a team at each end, the two scores between', () => {
    const laptop = css.slice(css.indexOf('@media (min-width: 64rem) {\n  .ui-scoreboard-teams'));
    expect(laptop.startsWith('@media')).toBe(true);
    expect(laptop).toMatch(
      /\.ui-scoreboard-teams \{\s*grid-template-columns: minmax\(0, 1fr\) auto auto auto minmax\(0, 1fr\);/,
    );
    // A team's box is dissolved, never removed: its parts are placed on the board's grid.
    expect(laptop).toMatch(/\.ui-scoreboard-side \{\s*display: contents;/);
    expect(laptop).toMatch(
      /\.ui-scoreboard-side:first-child > \.ui-scoreboard-score \{\s*grid-column: 2;\s*\}\s*\.ui-scoreboard-side:last-child > \.ui-scoreboard-score \{\s*grid-column: 4;\s*\}\s*\.ui-scoreboard-middle \{\s*grid-column: 3;/,
    );
  });

  it('keeps a left-over board of a narrow list the size of the others', () => {
    expect(css).toMatch(
      /\.ui-card-grid\[data-layout='board'\]\[data-across='pair'\] > li:only-child \{\s*grid-column: 1 \/ -1;/,
    );
    expect(css).not.toMatch(/\[data-across='pair'\] > li:last-child:nth-child\(odd\)/);
  });

  it('never stretches a board that is a list by itself across the page: about 560 wide', () => {
    // 8 × 64 + 48 = 560, from a tablet up, in a list at the page's width or in a column.
    expect(css).toMatch(
      /@media \(min-width: 48rem\) \{\s*\.ui-card-grid\[data-layout='board'\]:is\(\[data-across='two'\], \[data-across='pair'\]\) > li:only-child \{\s*max-inline-size: calc\(8 \* var\(--step-8\) \+ var\(--step-7\)\);/,
    );
  });

  it('gives a table’s shield a little more than a line, and a round’s count its own line on a phone', () => {
    expect(css).toMatch(
      /\.ui-emblem\[data-size='small'\] \{\s*block-size: calc\(var\(--step-5\) \+ var\(--step-1\)\);/,
    );
    // The count still has its own line, in line with the round's name. Since step 2.147
    // part 3 it is the heading's own room at the start that puts it there (the mark that
    // says the group opens stands in that room), so the count needs no margin of its own,
    // and a note that wraps ("1 game postponed") wraps under the name too.
    expect(css).toMatch(
      /@media \(max-width: 29\.99rem\) \{\s*\.ui-group-summary \{\s*flex: 1 1 100%;\s*margin-inline-start: 0;/,
    );
    expect(css).toMatch(/\.ui-group > summary \{[^}]*padding-inline-start: var\(--step-6\);/);
    expect(css).toMatch(
      /\.ui-group > summary::before \{[^}]*position: absolute;[^}]*inset-inline-start: var\(--step-2\);/,
    );
  });

  it('gives every state’s pill a line of its own on a phone, the long and the short alike', () => {
    expect(css).toMatch(
      /@media \(max-width: 47\.99rem\) \{\s*\.ui-game-card\[data-layout='board'\] \.ui-game-about \{\s*flex-basis: 100%;/,
    );
  });
});

describe('a team’s card', () => {
  it('has the team’s large shield, a fine line of its color at the top, and its record as its one figure', () => {
    const html = render(
      createElement(TeamCard, {
        name: arabicName,
        href: '/x/teams/a',
        color: '#2f7fb8',
        figure: { label: 'Record', value: '5-1' },
        facts: [],
      }),
    );
    expect(html).toContain('<article class="ui-team-card" style="--team-color:#2f7fb8">');
    expect(html.match(/<svg class="ui-emblem"/g)).toHaveLength(1);
    // Anything that is not a color never reaches the page; the line is then the accent.
    const plain = render(
      createElement(TeamCard, {
        name: 'Owls',
        href: '/x/teams/o',
        color: 'red;x',
        figure: { label: 'Record', value: '0-0' },
        facts: [],
      }),
    );
    expect(plain).toContain('<article class="ui-team-card">');
    expect(plain).not.toContain('red;x');
    // The line is drawn as the shield's own lines are (the team's color with a little of
    // the text color in it), so a dark team color shows on a dark page (step 2.147 part 3;
    // it was the color at half strength, which a dark color lost on a dark panel).
    expect(css).toMatch(
      /\.ui-team-card \{[^}]*border-block-start: var\(--line-heavy\) solid\s*color-mix\(in srgb, var\(--team-color, var\(--color-accent\)\) 74%, var\(--color-text\)\);/,
    );
    expect(css).toMatch(
      /\.ui-emblem \{[^}]*color: color-mix\(in srgb, var\(--emblem-color\) 74%, var\(--color-text\)\);/,
    );
    // Under the pointer the top line stays the team's.
    expect(css).toMatch(
      /\.ui-team-card:hover \{\s*border-inline-color: [^;]+;\s*border-block-end-color: [^;]+;\s*\}/,
    );
    expect(css).toMatch(/\.ui-team-card > \.ui-emblem \{\s*block-size: var\(--step-8\);/);
    expect(css).toMatch(/\.ui-team-card-figure \{[^}]*font-size: var\(--text-28\);/);
  });

  it('stands upright in a list of teams from a tablet up, three across, with a foot line', () => {
    const html = render(
      createElement(TeamCard, {
        name: 'Owls',
        href: '/x/teams/o',
        figure: { label: 'Record', value: '2-1' },
        facts: [{ key: 'seed', label: 'Seed', value: '1' }],
        way: 'Roster',
      }),
    );
    // The way on is only drawn: the card's one link is the team's name.
    expect(html).toContain('<span class="ui-team-card-way" aria-hidden="true">Roster</span>');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(css).toMatch(/\.ui-team-card-way \{\s*display: none;/);
    // The rules of the upright card: from a tablet up (the stylesheet with its notes taken out).
    const upright =
      /@media \(min-width: 48rem\) \{\s*\.ui-card-grid\[data-layout='teams'\] \{[\s\S]*?\n\}\n/.exec(
        css,
      )?.[0] ?? '';
    expect(upright).toMatch(
      /\.ui-card-grid\[data-layout='teams'\] \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/,
    );
    expect(upright).toMatch(/\.ui-card-grid\[data-layout='teams'\] > li \{\s*grid-column: span 2;/);
    // A shield of 72, the name in the display face at 22 (28 on a laptop).
    expect(upright).toMatch(
      /\.ui-team-card > \.ui-emblem \{\s*grid-column: 1 \/ -1;\s*block-size: calc\(var\(--step-8\) \+ var\(--step-2\)\);/,
    );
    expect(upright).toMatch(/\.ui-team-card-name \{[^}]*font-size: var\(--text-22\);/);
    expect(upright).toMatch(/\.ui-team-card-way \{[^}]*display: inline-flex;/);
    expect(css).toMatch(
      /@media \(min-width: 64rem\) \{[\s\S]*?\.ui-card-grid\[data-layout='teams'\] \.ui-team-card-name \{\s*font-size: var\(--text-28\);/,
    );
  });

  it('never splits a word of a team’s name', () => {
    const name = /\.ui-team-card-name \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(name).toMatch(/overflow-wrap: normal;/);
    expect(name).toMatch(/hyphens: manual;/);
    expect(name).toMatch(/text-overflow: ellipsis;/);
    expect(name).not.toMatch(/hyphens: auto/);
  });
});

describe('a team’s shield in a table of statistics', () => {
  const table = (rows: Parameters<typeof SortableStatsTable>[0]['rows']) =>
    render(
      createElement(SortableStatsTable, {
        caption: 'Players',
        columns: [
          { key: 'player', label: 'Player' },
          { key: 'team', label: 'Team' },
        ],
        rows,
        labels: { sortBy: 'Sort by' },
        emblems: true,
      }),
    );

  it('carries the team’s letter for one team, and no letter for a player of several', () => {
    const html = table([
      { id: 'a', cells: { player: 'Dana', team: 'Owls' }, chips: { team: '#663399' } },
      {
        id: 'b',
        cells: { player: 'Lee', team: 'Owls, Falcons' },
        chips: { team: null },
        severalTeams: { team: true },
      },
    ]);
    const letters = [...html.matchAll(/<text class="ui-emblem-letter"[^>]*>([^<]*)<\/text>/g)].map(
      (m) => m[1],
    );
    // "Owls, Falcons" does not show an "O": that would say the player is the Owls' alone.
    expect(letters).toEqual(['O', '']);
    expect(html.match(/<svg class="ui-emblem" data-size="small"/g)).toHaveLength(2);
    expect(html).toContain('<span dir="auto">Owls, Falcons</span>');
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
        '.ui-crumbs a',
        // The short rule under a title, and the mark of a page that is only a message.
        '.ui-section-head h2::after',
        '.ui-message-mark',
        '.ui-stat dd',
        '.ui-game-score',
        '.ui-game-side-score',
        ".ui-game-card[data-layout='board']:has(.ui-game-link):hover",
        ".ui-game-card[data-featured='true']",
        ".ui-standings[data-emblems='true'] tbody td.ui-num:first-child",
        '.ui-team-card-figure',
        // A team's card under the pointer: its edge, as a game's card.
        '.ui-team-card:hover',
        '.ui-leader:first-child .ui-leader-value',
        // A leader's one big number.
        '.ui-spot-value',
        // The scores of a game's big board (the loser's is set back to the text color).
        '.ui-scoreboard-score',
      ].sort(),
    );
    expect(css.replace(/\s+/g, ' ')).toContain(
      ".ui-scoreboard[data-state='final'] .ui-scoreboard-side:not([data-winner='true']) .ui-scoreboard-score { color: var(--color-text); font-weight: 400; }",
    );
  });

  it('the league’s color of decoration only where it need not be read: a rule, a bar, a fine line', () => {
    // The color as the league gave it: small marks beside words, never the words.
    expect(usedBy('--color-ornament')).toEqual(
      [
        '.ui-kicker::before',
        ".ui-game-score > [data-winner='true']",
        ".ui-game-side[data-winner='true'] .ui-game-side-score",
        ".ui-scoreboard-side[data-winner='true'] .ui-scoreboard-score",
      ].sort(),
    );
    // Laid on the page only as strongly as it takes to be seen: the lines that frame.
    expect(usedBy('--color-ornament-line')).toEqual(
      [
        '.ui-stat-strip',
        ".ui-game-card[data-layout='board']",
        '.ui-scoreboard',
        ".ui-table-frame:has(.ui-standings[data-emblems='true'])",
      ].sort(),
    );
    for (const name of ['--color-ornament', '--color-ornament-line']) {
      for (const rule of css.matchAll(/([^{}]+){([^{}]*)}/g)) {
        for (const line of (rule[2] ?? '').split(';')) {
          if (!line.includes(`var(${name})`)) continue;
          expect(line.trim(), rule[1]).toMatch(/^(background|border-[a-z-]+|text-decoration):/);
        }
      }
    }
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
        // The first leader's card is a small band: its edge and its number.
        ".ui-spot[data-first='true']",
        ".ui-spot[data-first='true'] .ui-spot-value",
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
