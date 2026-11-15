import { designToCssText, startingDesign, startingDesignKeys } from '@srleagues/site';
import { displayCss } from '@srleagues/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DesignStyle,
  displayStylesheet,
  displayStylesheetMark,
} from '../../features/shell/index.ts';
import { GET } from './route.ts';

const ask = (address: string) => GET(new Request(`https://example.test${address}`));

describe("the shared pieces' stylesheet, served once for every league (2.85 review, L3)", () => {
  it('is the shared pieces and nothing of any one league', async () => {
    const answer = ask(displayStylesheet);
    expect(answer.status).toBe(200);
    expect(answer.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    const css = await answer.text();
    expect(css).toBe(displayCss);
    for (const key of startingDesignKeys) {
      expect(css).not.toContain(startingDesign(key).colors.primary);
    }
  });

  it('may be kept for good only by a request for the very text it sends', async () => {
    expect(displayStylesheet).toBe(`/display.css?v=${displayStylesheetMark}`);
    expect(displayStylesheetMark).toMatch(/^[0-9a-f]{12}$/);
    expect(ask(displayStylesheet).headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    // No mark, another version's mark, an empty one, or the mark with something added: the
    // current text, kept for a minute and never for good. Two builds answering at once
    // can then never leave an old text kept for a year under a new address.
    for (const address of [
      '/display.css',
      '/display.css?v=0123456789ab',
      '/display.css?v=',
      `/display.css?v=${displayStylesheetMark}x`,
      `/display.css?w=${displayStylesheetMark}`,
    ]) {
      const answer = ask(address);
      expect(answer.status, address).toBe(200);
      expect(answer.headers.get('Cache-Control'), address).toBe('public, max-age=60');
      expect(await answer.text(), address).toBe(displayCss);
    }
  });

  it("a league's page carries only its own values, and links to the shared stylesheet", () => {
    const design = startingDesign('midnight-gold');
    const html = renderToStaticMarkup(createElement(DesignStyle, { design }));
    expect(html).toContain(`<style>${designToCssText(design)}</style>`);
    expect(html).toContain(`href="${displayStylesheet}"`);
    // The 35 KB of shared styles are not written into the page any more.
    expect(html).not.toContain('.ui-table');
    expect(html.length).toBeLessThan(4000);
    expect(displayCss.length).toBeGreaterThan(30000);
  });
});
