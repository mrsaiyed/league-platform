// The league's design, header and footer (step 1.18): two different looks, the mark
// on every page (U-8), words from the message file (T-187) and right-to-left (T-188).
import { designToCssText, startingDesign } from '@srleagues/site';
import { htmlAttributes, en } from '@srleagues/site';
import { displayCss } from '@srleagues/ui';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { siteOfLeague } from '../../server/league-site.ts';
import { standInLeagues } from '../../server/stand-in-ports.ts';
import { DesignStyle } from './design-style.tsx';
import { SiteFooter } from './site-footer.tsx';
import type { AccountMenu } from './account-menu.ts';
import { SiteHeader } from './site-header.tsx';

const league = { slug: 'north-valley' };
const signInHref = '/signin?next=%2Fnorth-valley';
const madeUpAccount: AccountMenu = {
  initial: 'O',
  email: 'owner@example.test',
  adminHref: '/north-valley/admin',
  gamesHref: '/north-valley/admin/games',
  accountHref: '/account',
  onScoringPage: false,
};

describe('league design', () => {
  it('turns the two starting designs into visibly different variables', () => {
    const a = renderToStaticMarkup(
      createElement(DesignStyle, { design: startingDesign('midnight-gold') }),
    );
    const b = renderToStaticMarkup(
      createElement(DesignStyle, { design: startingDesign('clean-court') }),
    );
    expect(a).not.toBe(b);
    for (const name of [
      '--color-background',
      '--color-primary',
      '--font-heading',
      '--radius',
      'color-scheme',
    ]) {
      const value = (text: string) => new RegExp(`${name}: ([^;]+);`).exec(text)?.[1];
      expect(value(a), name).toBeDefined();
      expect(value(a), name).not.toBe(value(b));
    }
  });

  it('writes the variables once, as one style block', () => {
    const html = renderToStaticMarkup(
      createElement(DesignStyle, { design: startingDesign('clean-court') }),
    );
    expect(html.match(/<style/g)).toHaveLength(1);
    expect(html).toContain(designToCssText(startingDesign('clean-court')));
  });

  it('gives two made-up leagues two different designs and a neutral one to the rest', () => {
    const one = siteOfLeague(standInLeagues.live);
    const two = siteOfLeague(standInLeagues.other);
    expect(one.design).not.toEqual(two.design);
    expect(siteOfLeague({ id: 'unknown', slug: 'some-league' }).name).toBe('some-league');
  });
});

describe('header, menu and footer', () => {
  it('shows the league name first, the menu and sign in for a visitor', () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'North Valley League', account: null, signInHref }),
    );
    expect(html.indexOf('North Valley League')).toBeLessThan(html.indexOf(en['nav.schedule']));
    for (const key of [
      'nav.home',
      'nav.schedule',
      'nav.standings',
      'nav.teams',
      'account.signInOrCreate',
    ] as const) {
      expect(html).toContain(en[key]);
    }
    expect(html).toContain('href="/north-valley/schedule"');
    const signedIn = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'x', account: madeUpAccount, signInHref }),
    );
    expect(signedIn).not.toContain(en['account.signInOrCreate']);
  });

  it('holds the season picker, between the name and sign in, when the page has one', () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, {
        league,
        name: 'North Valley League',
        account: null,
        signInHref,
        current: 'schedule',
        season: {
          action: '/north-valley/schedule',
          value: 'spring-2026',
          options: [
            { value: 'fall-2026', label: 'Fall 2026' },
            { value: 'spring-2026', label: 'Spring 2026' },
          ],
          keep: { team: 'owls' },
        },
      }),
    );
    const top = html.slice(0, html.indexOf('class="site-tabs"'));
    expect(top).toContain('<form class="ui-picker" action="/north-valley/schedule" method="get">');
    expect(top).toContain('<input type="hidden" name="team" value="owls"/>');
    expect(top).toMatch(
      /<label for="site-season">Season<\/label><select id="site-season" name="season"/,
    );
    expect(top).toContain('<option value="spring-2026" selected="">Spring 2026</option>');
    // Works with scripts off: the picker keeps its quiet button until the page script runs.
    expect(top).toContain('<button type="submit">Show</button>');
    expect(top.indexOf('class="site-name"')).toBeLessThan(top.indexOf('class="site-season"'));
    expect(top.indexOf('class="site-season"')).toBeLessThan(top.indexOf('class="site-sign-in"'));
    expect(html.match(/name="season"/g)).toHaveLength(1);
    const without = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'x', account: null, signInHref }),
    );
    expect(without).not.toContain('site-season');
    expect(without).not.toContain('<select');
  });

  it('offers sign in inside the phone menu too, and the menu button has a name', () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'x', account: null, signInHref }),
    );
    const panel = html.slice(html.indexOf('class="site-menu-panel"'), html.indexOf('</details>'));
    expect(panel).toContain(
      `class="site-menu-sign-in" href="/signin?next=%2Fnorth-valley">${en['account.signInOrCreate']}</a>`,
    );
    expect(html).toMatch(
      new RegExp(`<summary>.*<span class="ui-visually-hidden">${en['nav.menu']}</span></summary>`),
    );
  });

  it('keeps the header one row high on a phone: a small name, sign in put away', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(0, css.indexOf('@media (min-width: 48rem)'));
    expect(phone).toMatch(/\.site-header \.site-name \{[^}]*font-size: var\(--text-16\);/);
    // The name's words are in an element of their own inside the link, so the link can be
    // as tall as a thumb needs while its words are still held to two lines.
    expect(phone).toMatch(/\.site-header \.site-name > span \{[^}]*-webkit-line-clamp: 2;/);
    expect(phone).toMatch(/\.site-header \.site-sign-in \{\s*display: none;/);
    // No size of its own: the tap height and the scales come from the design's variables.
    for (const raw of ['2.75rem', '0.375rem', '0.3125rem', '1.25rem', 'font-size: 1rem']) {
      expect(css).not.toContain(raw);
    }
    // Nor a line of 2 pixels: the heavier line has one name (the menu's bars and cross, the
    // line under the page a visitor is on).
    expect(css).not.toMatch(/\b2px\b/);
    expect(css).toMatch(
      /\.site-menu-icon \{[^}]*border-block: var\(--line-heavy\) solid currentColor;/,
    );
  });

  it('leaves the season picker’s arrow to the shared picker, so high contrast gets the browser’s back', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    // The shared picker's stylesheet draws the arrow and, where colors are forced, hands
    // it back to the browser (packages/ui, hero-pieces.test.ts). No rule of the header
    // sets the arrow, its room or the field's whole background, so that holds there too.
    const season = [...css.matchAll(/([^{}]*\.site-season[^{}]*select[^{}]*)\{([^}]*)\}/g)];
    expect(season.length).toBeGreaterThan(2);
    for (const [, , body] of season) {
      expect(body).not.toMatch(
        /appearance|padding-inline-end|padding-inline:|padding:|background-image|background:/,
      );
    }
  });

  it('takes every gap of the frame from the spacing scale, and keeps what a thumb taps 44 high', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    // The same rule as the shared pieces' stylesheet (packages/ui, page-pieces.test.ts):
    // every gap, padding, margin and inset is a step of the scale, the page's gutter (itself
    // a step), a hairline or a share.
    const step = String.raw`var\(--(?:step-\d|space(?:-tight|-section)?|gutter|tabs-pad)\)`;
    const plain = String.raw`(?:${step}|0|auto|-?1px|\d+%)`;
    const sum = String.raw`calc\((?:${step}|-?1px|\d+%|-?\d+|[-+*/ ()])+\)`;
    const onScale = new RegExp(`^(?:${plain}|${sum})(?: (?:${plain}|${sum}))*$`);
    const spaces = [
      ...css.matchAll(
        /(?:^|[\s;{])((?:row-|column-)?gap|(?:padding|margin|inset)(?:-block|-inline)?(?:-start|-end)?):\s*([^;]+);/g,
      ),
    ].map((m) => `${m[1]}: ${(m[2] ?? '').trim().replace(/\s+/g, ' ')}`);
    expect(spaces.length).toBeGreaterThan(40);
    expect(spaces.filter((space) => !onScale.test(space.slice(space.indexOf(': ') + 2)))).toEqual(
      [],
    );
    expect(css).toMatch(/--gutter: var\(--step-4\);/);
    // Everything in the frame that is tapped: the name, sign in and the menu button, the
    // menu's links on a phone (48) and as tabs, the footer's links, and the skip link.
    const tall = /min-block-size: var\(--(?:tap|step-7)\);/;
    for (const selector of [
      '.league-site .site-skip',
      '.site-header .site-name',
      '.site-header .site-sign-in,\n.site-menu > summary',
      '.site-header .site-menu-panel li a',
      '.site-header .site-menu-sign-in',
      '.site-header .site-tabs a',
      '.site-footer nav a',
    ]) {
      // A selector may be written more than once (with others, then alone): one of its
      // rules must set the height.
      const rules = css
        .split(`\n${selector} {`)
        .slice(1)
        .map((rest) => rest.slice(0, rest.indexOf('}')));
      expect(rules.length, selector).toBeGreaterThan(0);
      expect(
        rules.some((rule) => tall.test(rule)),
        selector,
      ).toBe(true);
    }
  });

  it('draws the focus ring in the header in the header text color, whichever stylesheet lands last', () => {
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
    const css = strip(
      readFileSync(new URL('../../app/[league]/league-site.css', import.meta.url), 'utf8'),
    );
    const shared = strip(displayCss);
    const ring = /([^{}]+)\{\s*outline-color: var\(--header-text\);\s*\}/.exec(css)?.[1]?.trim();
    expect(ring).toBe('.league-site .site-header :focus-visible');
    // The shared pieces draw one ring for everything (and the team card's own, which is
    // never in the header). The header's rule names more than the shared one, so it wins
    // even though the shared styles come later in the page.
    const colored = [...shared.matchAll(/([^{}]+)\{[^{}]*outline: [^;]*var\(--color[^{}]*\}/g)]
      .map((m) => (m[1] ?? '').trim())
      .sort();
    // The edge of a field a refusal is about (step 2.155) is drawn only while the field is
    // not focused (`:not(:focus-visible)`), so it never colors a focus ring, in the header
    // or anywhere.
    expect(colored).toEqual(
      [
        '.ui-root :focus-visible',
        '.ui-team-card-name a:focus-visible::after',
        ".ui-root [aria-invalid='true']:not(:focus-visible)",
      ].sort(),
    );
    const weight = (selector: string) => (selector.match(/[.:][a-z-]+/g) ?? []).length;
    expect(weight(ring ?? '')).toBeGreaterThan(weight('.ui-root :focus-visible'));
  });

  // Changed by step 2.147: the season picker used to share the phone header's first row
  // with the name, or to take the row under it where scripts were off. The header now
  // makes room for the league's mark, so on a phone the picker is in the menu's panel:
  // the name has the first row to itself, with scripts on or off, at every phone width.
  it('keeps the name its room on a phone: it has the first row, the picker is in the open menu', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(0, css.indexOf('@media (min-width: 48rem)'));
    // On a phone the picker is put away, and takes a row of its own under the menu's
    // links whenever the menu is open. No rule there depends on scripts: the menu is a
    // plain disclosure and the picker keeps its own button.
    expect(phone).toMatch(/\.site-season \{\s*display: none;\s*flex: 1 1 100%;/);
    expect(phone).toMatch(/\.site-menu\[open\] ~ \.site-season \{\s*display: block;/);
    expect(phone).not.toMatch(/\.site-header-top:has\(\.site-season\)/);
    // The menu's panel is part of the header's own flow, a whole row under the first, so
    // the picker that follows it in the page follows it on the screen.
    expect(phone).toMatch(/\.site-menu \{\s*flex: 1 1 100%;/);
    expect(phone).not.toMatch(/\.site-menu-panel \{[^}]*position: absolute;/);
    // The name's row holds the league's mark, the name and the menu button, and nothing
    // else: the button stands at the end of the row, and the name keeps clear of it.
    expect(phone).toMatch(
      /\.site-menu > summary \{\s*position: absolute;[^}]*inset-inline-end: var\(--gutter\);/,
    );
    expect(phone).toMatch(
      /\.site-brand \{[^}]*margin-inline-end: calc\(var\(--step-7\) \+ var\(--step-2\)\);/,
    );
    // An open menu never grows past the screen.
    expect(phone).toMatch(
      /\.site-header-top:has\(\.site-menu\[open\]\) \{\s*max-block-size: 100vh;\s*overflow-y: auto;/,
    );
    // From a tablet up the picker is back in the first row, whether the menu was left open
    // or not.
    expect(css.slice(phone.length)).toMatch(
      /\.site-season,\s*\.site-menu\[open\] ~ \.site-season \{\s*display: block;\s*flex: none;/,
    );
    // Nothing in the frame is moved out of the page's own order, so the keyboard goes
    // through the header as the eye does: the name, the menu, the season, on a phone; the
    // name, the season, the way in, the menu, from a tablet up.
    expect(css).not.toMatch(/(^|[\s;{])order:/m);
    const html = renderToStaticMarkup(
      createElement(SiteHeader, {
        league,
        name: 'North Valley League',
        account: null,
        signInHref,
        season: { action: '/north-valley', value: 'a', options: [], keep: {} },
      }),
    );
    const at = (text: string) => html.indexOf(text);
    expect(at('class="site-name"')).toBeLessThan(at('class="site-menu"'));
    expect(at('class="site-menu"')).toBeLessThan(at('class="site-season"'));
    expect(at('class="site-season"')).toBeLessThan(at('class="site-sign-in"'));
    expect(at('class="site-sign-in"')).toBeLessThan(at('class="site-tabs"'));
    // Hovered, the header's picker and button stay in the header's own text color.
    expect(css).toMatch(
      /\.site-header \.site-season button:hover \{[^}]*color: var\(--header-text\);/,
    );
  });

  it('carries the Powered by SR Leagues mark and the footer links (U-8)', () => {
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toContain('Powered by SR Leagues');
    expect(html).toContain(en['footer.terms']);
    expect(html).toContain(en['footer.privacy']);
    // With the league's name before them, in its own direction, when the page gives it.
    const named = renderToStaticMarkup(createElement(SiteFooter, { name: 'دوري الوادي' }));
    expect(named).toContain('<p class="site-footer-name" dir="auto">دوري الوادي</p>');
    expect(named.indexOf('site-footer-name')).toBeLessThan(named.indexOf(en['footer.terms']));
    expect(html).not.toContain('site-footer-name');
  });

  // Step 2.147: the header with presence.
  // The fixed small line "Official league site" was taken out in the second landing of
  // step 2.147's part 2 (the lead's decision): a line of the league's own is a setting
  // for a later step, and until then none is shown.
  it("shows the league's mark and its name, with no line under it; the name alone is the link's words", () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, {
        league,
        name: 'North Valley League',
        account: madeUpAccount,
        signInHref,
      }),
    );
    // The mark: the league's first letter in a shield, drawn as part of the page and
    // silent to a screen reader. It stands beside the link, not in it, so the link says
    // the league's name and nothing else.
    expect(html).toMatch(
      /<div class="site-brand"><svg class="ui-emblem" data-size="card" data-kind="league"[^>]*aria-hidden="true"[^>]*>.*?>N<\/text><\/svg><a class="site-name" href="[^"]+" dir="auto"><span>North Valley League<\/span><\/a><\/div>/,
    );
    expect(html).not.toContain('site-tagline');
    expect(html).not.toContain('Official league site');
    expect(Object.keys(en)).not.toContain('shell.tagline');
    expect(html).not.toMatch(/<svg[^>]*>(?:(?!<\/svg>).)*<image/);
    // The whole of it is the way home: the link covers the mark too.
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.site-brand \{\s*position: relative;/);
    expect(css).toMatch(
      /\.site-header \.site-name::after \{\s*content: '';\s*position: absolute;\s*inset: 0;/,
    );
    expect(css).not.toContain('site-tagline');
    expect(css).toMatch(/\.site-header \.site-brand \.ui-emblem \{[^}]*pointer-events: none;/);
  });

  it('never lets a long name touch the edges of its row on a phone: two lines have room in it', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(0, css.indexOf('@media (min-width: 48rem)'));
    // The row is at least 56 high and has no height it must keep to; 6 of it is kept clear
    // above and below whatever stands in it.
    const row = /\.site-header-top \{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(row).toMatch(/min-block-size: calc\(var\(--tap\) \+ var\(--step-3\)\);/);
    expect(row).toMatch(/padding-block: calc\(var\(--step-3\) \/ 2\);/);
    expect(row).not.toMatch(/(?:^|\s)(?:max-)?block-size:/);
    // The name's link is at least as tall as a thumb needs (44) and would grow with its
    // words: 2 clear above and below them, 8 in all with the row's own 6. Two lines of the
    // name (about 35) are less than 44, so the row stays one height for every league.
    const name = /\.site-header \.site-name \{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(name).toMatch(/min-block-size: var\(--tap\);/);
    expect(name).toMatch(/padding-block: calc\(var\(--step-1\) \/ 2\);/);
    expect(name).toMatch(/align-items: center;/);
    expect(name).toMatch(/font-size: var\(--text-16\);[^}]*line-height: 1\.1;/);
    expect(name).not.toMatch(/(?:^|\s)(?:max-)?block-size:/);
    // Cut short after two lines.
    expect(phone).toMatch(/\.site-header \.site-name > span \{[^}]*line-clamp: 2;/);
    // The mark and the menu button are both hung from the top of the row, at the same
    // distance, so a taller row leaves them level with each other.
    expect(phone).toMatch(
      /\.site-header \.site-brand \.ui-emblem \{\s*position: absolute;\s*inset-block-start: calc\(var\(--step-3\) \/ 2\);/,
    );
    expect(phone).toMatch(
      /\.site-menu > summary \{\s*position: absolute;\s*inset-block-start: calc\(var\(--step-3\) \/ 2\);/,
    );
    // An open menu's button is a cross, and the panel's line runs to the screen's edges.
    expect(phone).toMatch(
      /\.site-menu\[open\] \.site-menu-icon \{\s*border-block-color: transparent;\s*\}\s*\.site-menu\[open\] \.site-menu-icon::before \{\s*transform: rotate\(45deg\);\s*\}\s*\.site-menu\[open\] \.site-menu-icon::after \{\s*opacity: 1;\s*transform: rotate\(-45deg\);/,
    );
    expect(phone).toMatch(
      /\.site-menu-panel \{[^}]*margin-inline: calc\(-1 \* var\(--gutter\)\);[^}]*padding-inline: var\(--gutter\);\s*border-block-start: 1px solid var\(--header-rule\);/,
    );
    // From a tablet up the name is one line and the row keeps its own height.
    const wide = css.slice(phone.length);
    expect(wide).toMatch(/\.site-header-top \{[^}]*min-block-size: 0;\s*padding-block: 0;/);
  });

  it('keeps the menu on top while the page scrolls, and brings the name back for the keyboard', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.site-header \{[^}]*position: sticky;\s*inset-block-start: 0;/);
    const wide = css.slice(css.indexOf('@media (min-width: 48rem)'));
    // From a tablet up the first row is exactly as tall as the header is moved up by, so
    // only the menu's row stays; with the keyboard in the header, all of it shows.
    const rise = 'calc(var(--step-8) + var(--step-4))';
    expect(wide).toContain(
      `.site-header {\n    inset-block-start: calc(-1 * (${rise.slice(5, -1)}));`,
    );
    expect(wide).toMatch(/\.site-header:focus-within \{\s*inset-block-start: 0;/);
    expect(wide).toContain(`block-size: ${rise};`);
  });

  it('lets a page open with a band the width of the screen, and keeps every other page in the column', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    // The column is the body's plain rule, with no condition on it (the code review, L6):
    // a browser that does not know `:has()` still draws every ordinary page in the column.
    expect(css).toMatch(
      /\n\.site-body \{\s*flex: 1;\s*inline-size: 100%;\s*max-inline-size: calc\(70rem \+ 2 \* var\(--gutter\)\);\s*margin-inline: auto;\s*padding-block: var\(--step-5\) var\(--step-8\);\s*padding-inline: var\(--gutter\);/,
    );
    // Only the page with a band asks for more, and only that asking uses `:has()`.
    expect(css).toMatch(
      /\.site-body:has\(> \.site-wide\) \{\s*max-inline-size: none;\s*padding-block-start: 0;\s*padding-inline: 0;/,
    );
    const conditional = [...css.matchAll(/([^{}]*:has\([^{}]*)\{/g)].map((m) =>
      (m[1] ?? '').trim().replace(/\s+/g, ' '),
    );
    expect(conditional).toEqual([
      '.site-header-top:has(.site-menu[open])',
      '.site-body:has(> .site-wide)',
      '@supports not selector(:has(*))',
      // Not the column: the phone's home page puts its later matchups away (a browser
      // that does not know `:has()` shows them all).
      // Counted by what a card is, never by where it stands: a game still to start is put
      // away only when two such games stand before it. A postponed game, or one that has
      // just gone live in its place, takes no coming game's place (the code review found
      // the rule by position could leave no coming game on the phone).
      ".home-next .ui-card-grid > li:has(> .ui-game-card[data-status='scheduled']) ~ li:has(> .ui-game-card[data-status='scheduled']) ~ li:has(> .ui-game-card[data-status='scheduled'])",
      // (The open menu's button and line are checked in the test of the phone header below.)
      // And one fewer while a game is being played (its board already heads the page):
      // the next game that will be played is always there.
      ".home-next[data-live='true'] .ui-card-grid > li:has(> .ui-game-card[data-status='scheduled']) ~ li:has(> .ui-game-card[data-status='scheduled'])",
    ]);
    // No coming game is ever put away by its place in the list.
    expect(css).not.toMatch(/\.home-next[^{]*nth-child/);
    // The same phone, the same moment: the latest games show one board.
    expect(css).toMatch(
      /\.home-pair\[data-live='true'\] > \.ui-section:first-child \.ui-card-grid > li:nth-child\(n \+ 2\) \{\s*display: none;/,
    );
    expect(css).toMatch(
      /@supports not selector\(:has\(\*\)\) \{\s*\.site-wide \.site-column \{\s*padding-inline: 0;/,
    );
    // The same column a wide page puts its own content in.
    expect(css).toMatch(
      /\.site-column \{\s*inline-size: 100%;\s*max-inline-size: calc\(70rem \+ 2 \* var\(--gutter\)\);\s*margin-inline: auto;\s*padding-inline: var\(--gutter\);/,
    );
  });
});

describe('right to left (T-188)', () => {
  it('gives an Arabic league name its own direction, and an English one its own', () => {
    const arabic = renderToStaticMarkup(
      createElement(SiteHeader, {
        league,
        name: 'دوري الوادي',
        account: madeUpAccount,
        signInHref,
      }),
    );
    // dir="auto": the browser reads the name's first strong letter, so any script works
    expect(arabic).toMatch(/class="site-name"[^>]*dir="auto"/);
    const english = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'Valley', account: madeUpAccount, signInHref }),
    );
    expect(english).toMatch(/class="site-name"[^>]*dir="auto"/);
  });

  it('turns the whole page around for a right-to-left language', () => {
    expect(htmlAttributes('ar')).toEqual({ lang: 'ar', dir: 'rtl' });
    expect(htmlAttributes('en').dir).toBe('ltr');
  });

  it('styles the shell with start and end, never left and right', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/(?:^|[\s;{])(?:margin|padding|border)-(?:left|right)\b/m);
    expect(css).not.toMatch(/(?:^|[\s;{])(?:left|right)\s*:/m);
    expect(css).not.toMatch(/text-align:\s*(?:left|right)/);
  });
});
