// The Terms and Privacy note until the lawyer's versions exist (B-14, step 2.135): every
// word from the message files, one heading order, who to write to with and without the
// site's contact setting, the way back to the league the reader came from, and no mark
// that keeps the pages out of search engines.
import { en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegalNote, legalNoteHref, type LegalPage } from './legal-note.tsx';

const pages: readonly LegalPage[] = ['terms', 'privacy'];
const back = { name: 'North Valley League', href: '/north-valley/schedule' };
const draw = (page: LegalPage, more: Partial<Parameters<typeof LegalNote>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(LegalNote, {
      page,
      back: null,
      from: null,
      contactEmail: 'contact@example.test',
      ...more,
    }),
  );
/** The text of the markup, as a reader meets it, with the HTML's own escapes undone. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ');
const legalKeys = (Object.keys(en) as (keyof typeof en)[]).filter((key) =>
  key.startsWith('legal.'),
);

describe('the Terms and Privacy note (step 2.135)', () => {
  it('is no longer "not built yet", and says at the top that it is the short version', () => {
    for (const page of pages) {
      const html = draw(page);
      expect(html).not.toContain(en['shell.notBuilt']);
      const text = textOf(html);
      const title = page === 'terms' ? en['page.terms'] : en['page.privacy'];
      expect(text.indexOf(title)).toBeLessThan(text.indexOf(en['legal.shortVersion']));
      expect(text.indexOf(en['legal.shortVersion'])).toBeLessThan(
        text.indexOf(en['legal.lastChanged']),
      );
      expect(text).toContain(en['legal.lastChanged']);
    }
  });

  it('has one page title and section headings under it, in one order', () => {
    for (const page of pages) {
      const levels = [...draw(page).matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));
      expect(levels[0]).toBe(1);
      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      expect(levels.slice(1).every((level) => level === 2)).toBe(true);
      expect(levels.length).toBeGreaterThan(3);
    }
  });

  it('says every legal sentence somewhere, each from the message files', () => {
    const text = textOf(pages.map((page) => draw(page, { back })).join(' '));
    const unsaid = legalKeys
      .filter((key) => key !== 'legal.contact.siteThroughLeague')
      .filter((key) => !text.includes(en[key].replace('{league}', back.name)));
    expect(unsaid).toEqual([]);
  });

  it("gives the privacy page what we keep, why, who can see it and a child's own paragraph", () => {
    const text = textOf(draw('privacy'));
    for (const key of [
      'legal.privacy.keep.title',
      'legal.privacy.why.title',
      'legal.privacy.who.title',
      'legal.privacy.children.title',
      'legal.privacy.children.body',
      'legal.contact.title',
    ] as const) {
      expect(text, key).toContain(en[key]);
    }
  });

  it('says how to have an account taken off, before who to write to', () => {
    const text = textOf(draw('privacy'));
    const removal = text.indexOf(en['legal.privacy.remove.body']);
    expect(removal).toBeGreaterThan(-1);
    expect(text).toContain(en['legal.privacy.remove.league']);
    expect(removal).toBeLessThan(text.indexOf(en['legal.contact.title']));
  });

  it("names the league's admin first and the site's address second, as a link", () => {
    for (const page of pages) {
      const html = draw(page);
      const text = textOf(html);
      expect(text.indexOf(en['legal.contact.league'])).toBeLessThan(
        text.indexOf(en['legal.contact.site']),
      );
      expect(html).toContain('<a href="mailto:contact@example.test">contact@example.test</a>');
      expect(text).not.toContain(en['legal.contact.siteThroughLeague']);
    }
  });

  it('without the contact setting, sends the question through the league instead', () => {
    for (const page of pages) {
      const html = draw(page, { contactEmail: undefined });
      expect(html).not.toContain('mailto:');
      expect(textOf(html)).toContain(en['legal.contact.siteThroughLeague']);
      expect(textOf(html)).not.toContain(en['legal.contact.site']);
    }
  });

  it('leads back to the league the reader came from, and only then', () => {
    for (const page of pages) {
      const html = draw(page, { back, from: back.href });
      expect(html).toContain(`href="${back.href}"`);
      expect(textOf(html)).toContain('Back to North Valley League');
      expect(textOf(draw(page))).not.toContain('Back to');
    }
  });

  it('links the other note, carrying the page the reader came from', () => {
    expect(draw('terms', { from: '/north-valley' })).toContain(
      `href="/privacy?from=%2Fnorth-valley"`,
    );
    expect(draw('privacy', { from: '/north-valley' })).toContain(
      `href="/terms?from=%2Fnorth-valley"`,
    );
    expect(draw('terms')).toContain('href="/privacy"');
  });

  it('carries no mark that keeps the pages out of search engines', () => {
    for (const page of pages) expect(draw(page)).not.toMatch(/noindex|robots/i);
  });
});

describe('legalNoteHref', () => {
  it('carries a path on this site, and nothing else', () => {
    expect(legalNoteHref('terms', null)).toBe('/terms');
    expect(legalNoteHref('privacy', '/harbor-city/schedule?season=2026')).toBe(
      '/privacy?from=%2Fharbor-city%2Fschedule%3Fseason%3D2026',
    );
    for (const elsewhere of ['//elsewhere.example', 'https://elsewhere.example/', '/\\elsewhere'])
      expect(legalNoteHref('terms', elsewhere)).toBe('/terms');
  });
});
