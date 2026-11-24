import { designToCssText, startingDesign } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { platformDesign } from '../../features/shell/index.ts';
import { GET } from './route.ts';

describe('the stylesheet of pages that belong to no league', () => {
  it('is a stylesheet: the neutral design as variables, then the shared pieces', async () => {
    const answer = GET();
    expect(answer.status).toBe(200);
    expect(answer.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    const css = await answer.text();
    expect(css.startsWith(designToCssText(platformDesign))).toBe(true);
    expect(css).toContain('.ui-message');
    expect(css).toContain('.ui-standalone');
  });

  it("is SR Leagues' own look: the neutral design's colors, with a serif for its titles", () => {
    expect(platformDesign.colors).toEqual(startingDesign('clean-court').colors);
    expect(platformDesign.fonts.heading).toBe('gelasio');
  });

  it('may be kept by the browser, and holds nothing of any one league', async () => {
    const answer = GET();
    expect(answer.headers.get('Cache-Control')).toContain('public');
    expect(await answer.text()).not.toContain(startingDesign('midnight-gold').colors.primary);
  });
});
