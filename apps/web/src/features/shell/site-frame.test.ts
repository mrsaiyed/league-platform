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
import { SiteHeader } from './site-header.tsx';

const league = { slug: 'north-valley' };

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
      createElement(SiteHeader, { league, name: 'North Valley League', signedIn: false }),
    );
    expect(html.indexOf('North Valley League')).toBeLessThan(html.indexOf(en['nav.schedule']));
    for (const key of [
      'nav.home',
      'nav.schedule',
      'nav.standings',
      'nav.teams',
      'nav.signIn',
    ] as const) {
      expect(html).toContain(en[key]);
    }
    expect(html).toContain('href="/north-valley/schedule"');
    const signedIn = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'x', signedIn: true }),
    );
    expect(signedIn).not.toContain(en['nav.signIn']);
  });

  it('holds the season picker, between the name and sign in, when the page has one', () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, {
        league,
        name: 'North Valley League',
        signedIn: false,
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
      createElement(SiteHeader, { league, name: 'x', signedIn: false }),
    );
    expect(without).not.toContain('site-season');
    expect(without).not.toContain('<select');
  });

  it('offers sign in inside the phone menu too, and the menu button has a name', () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'x', signedIn: false }),
    );
    const panel = html.slice(html.indexOf('class="site-menu-panel"'), html.indexOf('</details>'));
    expect(panel).toContain(`class="site-menu-sign-in" href="/signin">${en['nav.signIn']}</a>`);
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
    expect(phone).toMatch(/\.site-header \.site-name \{[^}]*-webkit-line-clamp: 2;/);
    expect(phone).toMatch(/\.site-header \.site-sign-in \{\s*display: none;/);
    // No size of its own: the tap height and the scales come from the design's variables.
    for (const raw of ['2.75rem', '0.375rem', '0.3125rem', '1.25rem', 'font-size: 1rem']) {
      expect(css).not.toContain(raw);
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
    expect(colored).toEqual(
      ['.ui-root :focus-visible', '.ui-team-card-name a:focus-visible::after'].sort(),
    );
    const weight = (selector: string) => (selector.match(/[.:][a-z-]+/g) ?? []).length;
    expect(weight(ring ?? '')).toBeGreaterThan(weight('.ui-root :focus-visible'));
  });

  it('keeps the name its room on a phone: the picker with its button takes a row of its own', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    // Scripts off, or a browser that cannot say: two rows, the name first.
    expect(css).toMatch(
      /@media \(max-width: 47\.99rem\) \{\s*\.site-header-top \{\s*flex-wrap: wrap;\s*\}\s*\.site-season \{[^}]*flex: 1 0 100%;/,
    );
    // Scripts on: the button is put away by the shared styles, so one row is enough.
    expect(css).toMatch(
      /@media \(max-width: 47\.99rem\) and \(scripting: enabled\) \{\s*\.site-header-top \{\s*flex-wrap: nowrap;/,
    );
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
  });
});

describe('right to left (T-188)', () => {
  it('gives an Arabic league name its own direction, and an English one its own', () => {
    const arabic = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'دوري الوادي', signedIn: true }),
    );
    // dir="auto": the browser reads the name's first strong letter, so any script works
    expect(arabic).toMatch(/class="site-name"[^>]*dir="auto"/);
    const english = renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'Valley', signedIn: true }),
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
