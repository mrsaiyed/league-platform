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
