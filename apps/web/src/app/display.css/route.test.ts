import { designToCssText, startingDesign, startingDesignKeys } from '@srleagues/site';
import { displayCss } from '@srleagues/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignStyle, displayStylesheet } from '../../features/shell/design-style.tsx';
import { GET } from './route.ts';

describe("the shared pieces' stylesheet, served once for every league (2.85 review, L3)", () => {
  it('is the shared pieces and nothing of any one league', async () => {
    const answer = GET();
    expect(answer.status).toBe(200);
    expect(answer.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    const css = await answer.text();
    expect(css).toBe(displayCss);
    for (const key of startingDesignKeys) {
      expect(css).not.toContain(startingDesign(key).colors.primary);
    }
  });

  it('may be kept for good, because its address changes when its text does', () => {
    expect(GET().headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(displayStylesheet).toMatch(/^\/display\.css\?v=[0-9a-f]{12}$/);
  });

  it("a league's page carries only its own values, and links to the shared stylesheet", () => {
    const design = startingDesign('midnight-gold');
    const html = renderToStaticMarkup(createElement(DesignStyle, { design }));
    expect(html).toContain(`<style>${designToCssText(design)}</style>`);
    expect(html).toContain(`href="${displayStylesheet.replace('&', '&amp;')}"`);
    // The 35 KB of shared styles are not written into the page any more.
    expect(html).not.toContain('.ui-table');
    expect(html.length).toBeLessThan(4000);
    expect(displayCss.length).toBeGreaterThan(30000);
  });
});
