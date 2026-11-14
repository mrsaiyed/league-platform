// The values worked out from a design (step 2.85): colors that stay readable whatever a
// league chooses, the one spacing scale and the one type scale, and the frame of a dark
// design and of a light one.
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  derivedColors,
  designToCssVariables,
  mixColors,
  readableOn,
  startingDesign,
  startingDesignKeys,
  textOn,
  type DesignDocument,
} from '../../index.ts';

const hex = /^#[0-9a-f]{6}$/;
const colorsOf = (design: DesignDocument) => ({
  ...design.colors,
  highlight: design.colors.highlight ?? design.colors.accent,
});

describe('colors worked out from a design', () => {
  it('are readable where they are used, in both starting designs', () => {
    for (const key of startingDesignKeys) {
      const colors = colorsOf(startingDesign(key));
      const derived = derivedColors(colors);
      for (const surface of [colors.background, colors.panel]) {
        for (const text of [
          derived.muted,
          derived.primaryText,
          derived.accentText,
          derived.danger,
        ]) {
          expect(text).toMatch(hex);
          expect(
            contrastRatio(text, surface),
            `${key} ${text} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(derived.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.onHighlight, colors.highlight)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.onDanger, derived.danger)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leave a color alone when it already reads, and move it only as far as it must', () => {
    const dark = colorsOf(startingDesign('midnight-gold'));
    expect(derivedColors(dark).primaryText).toBe(dark.primary);
    const light = colorsOf(startingDesign('clean-court'));
    // The light design's orange is too pale for small labels on white: it is darkened.
    expect(contrastRatio(light.accent, light.panel)).toBeLessThan(4.5);
    const fitted = derivedColors(light).accentText;
    expect(fitted).not.toBe(light.accent);
    expect(contrastRatio(fitted, light.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fitted, light.panel)).toBeLessThan(5.5);
  });

  it('stay readable for a design whose colors are all alike', () => {
    const grey = {
      background: '#808080',
      panel: '#858585',
      text: '#8a8a8a',
      primary: '#7f7f7f',
      accent: '#818181',
      highlight: '#838383',
    };
    const derived = derivedColors(grey);
    expect(contrastRatio(derived.onPrimary, grey.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(derived.onHighlight, grey.highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(derived.muted, grey.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('mix, fit and choose as their names say', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#102030', '#ffffff', 0)).toBe('#102030');
    expect(readableOn('#000000', ['#ffffff', '#f0f0f0'])).toBe('#000000');
    expect(textOn('#000000', ['#111111', '#ffffff'])).toBe('#ffffff');
    expect(textOn('#777777', ['#707070'])).toMatch(/^#(000000|ffffff)$/);
  });
});

describe('the scales every screen is built from', () => {
  const rem = (value: string | undefined) => Number((value ?? '').replace('rem', '')) * 16;

  it('one spacing scale: 4, 8, 12, 16, 24, 32, 48, 64', () => {
    const vars = designToCssVariables(startingDesign('clean-court'));
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => rem(vars[`--step-${n}`]))).toEqual([
      4, 8, 12, 16, 24, 32, 48, 64,
    ]);
  });

  it('one type scale: 12, 14, 16, 18, 22, 28, 36', () => {
    const vars = designToCssVariables(startingDesign('midnight-gold'));
    expect([12, 14, 16, 18, 22, 28, 36].map((n) => rem(vars[`--text-${n}`]))).toEqual([
      12, 14, 16, 18, 22, 28, 36,
    ]);
  });

  it("a design's spacing choice picks steps of that scale, never a size between", () => {
    const scale = [4, 8, 12, 16, 24, 32, 48, 64];
    const base = startingDesign('clean-court');
    const sizes = (['compact', 'comfortable', 'roomy'] as const).map((spacing) => {
      const vars = designToCssVariables({ ...base, spacing });
      const chosen = ['--space', '--space-tight', '--space-section'].map((name) => rem(vars[name]));
      for (const size of chosen) expect(scale).toContain(size);
      return chosen;
    });
    expect(sizes[0]?.[0]).toBeLessThan(sizes[1]?.[0] ?? 0);
    expect(sizes[1]?.[0]).toBeLessThan(sizes[2]?.[0] ?? 0);
  });
});

describe('the frame of a dark design and of a light one', () => {
  const dark = designToCssVariables(startingDesign('midnight-gold'));
  const light = designToCssVariables(startingDesign('clean-court'));

  it('a dark header is the color of the page, a light one is a bar of the main color', () => {
    expect(dark['--header-background']).toBe('var(--color-background)');
    expect(light['--header-background']).toBe('var(--color-primary)');
    expect(light['--header-text']).toBe('var(--color-on-primary)');
  });

  it('marks the current page with a line in a dark design and a filled pill in a light one', () => {
    expect(dark['--tab-current-line']).toBe('var(--color-primary)');
    expect(dark['--tab-current-background']).toBe('transparent');
    expect(light['--tab-current-line']).toBe('transparent');
    expect(light['--tab-current-background']).toBe('var(--color-on-primary)');
    expect(dark['--tab-case']).toBe('uppercase');
    expect(light['--tab-case']).toBe('none');
  });

  it('draws borders as hairlines at low strength, never a full-strength line', () => {
    for (const vars of [dark, light]) {
      const strength = /color-mix\(in srgb, var\(--color-(?:primary|text)\) (\d+)%, transparent\)/;
      const found = strength.exec(vars['--color-line'] ?? '');
      expect(found).not.toBeNull();
      expect(Number(found?.[1])).toBeGreaterThanOrEqual(12);
      expect(Number(found?.[1])).toBeLessThanOrEqual(25);
    }
  });

  it('writes nothing that could close the style block or start another rule', () => {
    for (const vars of [dark, light]) {
      for (const [name, value] of Object.entries(vars)) {
        expect(value, name).not.toMatch(/[;{}<>]|url\(|@import/);
      }
    }
  });

  it('gives the two starting designs different corners, and both a pill', () => {
    expect(dark['--radius']).not.toBe(light['--radius']);
    expect(dark['--radius-pill']).toBe('999px');
    expect(
      designToCssVariables({ ...startingDesign('clean-court'), corners: 'sharp' }),
    ).toMatchObject({ '--radius': '0px', '--radius-small': '0px', '--radius-pill': '0px' });
  });
});
