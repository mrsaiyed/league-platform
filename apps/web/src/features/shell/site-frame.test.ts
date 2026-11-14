// The league's design, header and footer (step 1.18): two different looks, the mark
// on every page (U-8), words from the message file (T-187) and right-to-left (T-188).
import { designToCssText, startingDesign } from '@srleagues/site';
import { htmlAttributes, en } from '@srleagues/site';
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
