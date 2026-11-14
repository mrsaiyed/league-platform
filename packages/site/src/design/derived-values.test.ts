// The values worked out from a design (step 2.85): colors that stay readable whatever a
// league chooses, the one spacing scale and the one type scale, and the frame of a dark
// design and of a light one.
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  derivedColorWarnings,
  derivedColors,
  designToCssVariables,
  hoverTintShare,
  hoveredSurface,
  mixColors,
  readableOn,
  readsOn,
  startingDesign,
  startingDesignKeys,
  textOn,
  textSurfaces,
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

describe('colors under the pointer (hover)', () => {
  it('keep every text readable on a hovered row or button, in both starting designs', () => {
    for (const key of startingDesignKeys) {
      const colors = colorsOf(startingDesign(key));
      const derived = derivedColors(colors);
      const hovered = [colors.background, colors.panel].map((surface) =>
        hoveredSurface(surface, colors.primary),
      );
      expect(textSurfaces(colors)).toEqual([colors.background, colors.panel, ...hovered]);
      for (const surface of hovered) {
        for (const text of [
          colors.text,
          derived.muted,
          derived.primaryText,
          derived.accentText,
          derived.danger,
        ]) {
          expect(
            contrastRatio(text, surface),
            `${key} ${text} on hovered ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('never lays more of the main color under the pointer than the texts were fitted to', () => {
    for (const key of startingDesignKeys) {
      const tint = designToCssVariables(startingDesign(key))['--color-tint'] ?? '';
      const share = /var\(--color-primary\) (\d+)%/.exec(tint)?.[1];
      expect(Number(share) / 100, key).toBeLessThanOrEqual(hoverTintShare);
    }
  });

  it('moves a hovered tab of the light header away from its words, so they read at least as well', () => {
    const light = startingDesign('clean-court');
    expect(designToCssVariables(light)['--tab-hover-background']).toBe(
      'var(--color-primary-hover)',
    );
    const check = (colors: ReturnType<typeof colorsOf>, label: string) => {
      const derived = derivedColors(colors);
      expect(derived.primaryHover).toMatch(hex);
      expect(derived.primaryHover, label).not.toBe(colors.primary);
      expect(contrastRatio(derived.onPrimary, derived.primaryHover), label).toBeGreaterThanOrEqual(
        contrastRatio(derived.onPrimary, colors.primary),
      );
      expect(contrastRatio(derived.onPrimary, derived.primaryHover), label).toBeGreaterThanOrEqual(
        4.5,
      );
    };
    for (const key of startingDesignKeys) check(colorsOf(startingDesign(key)), key);
    // A league whose main color only just carries white words (4.54 to 1), and one that
    // carries dark words: the hovered bar still reads.
    check({ ...colorsOf(light), primary: '#767676' }, 'only just passes');
    check({ ...colorsOf(light), primary: '#f2c94c' }, 'dark words on a pale bar');
    expect(designToCssVariables(light)['--color-primary-hover']).toBe(
      derivedColors(colorsOf(light)).primaryHover,
    );
  });
});

describe('fitting a color to the surfaces it is read on', () => {
  it('goes on until it reads, however many steps that takes', () => {
    // Mid greys, the hardest case that can still be met: surfaces on both sides of the
    // point where a step turns from "lighter" to "darker", so each step for one undoes
    // the last for the other, and three steps were not always enough. And a dark set.
    for (const surfaces of [
      ['#808080', '#858585'],
      ['#757575', '#7c7c7c'],
      ['#101820', '#18242e', '#22303a'],
    ]) {
      for (const start of ['#808080', '#c62f3a', '#2fa89a', '#f3ead2']) {
        const fitted = readableOn(start, surfaces);
        expect(readsOn(fitted, surfaces), `${start} on ${surfaces.join(' ')}`).toBe(true);
      }
    }
  });

  it('says so when nothing can read: a light page with a dark panel', () => {
    const apart = ['#ffffff', '#0f2c40'];
    const fitted = readableOn('#808080', apart);
    expect(fitted).toMatch(hex);
    expect(readsOn(fitted, apart)).toBe(false);
    const design = {
      ...startingDesign('clean-court'),
      colors: { ...startingDesign('clean-court').colors, background: '#ffffff', panel: '#0f2c40' },
    };
    const warnings = derivedColorWarnings(design);
    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) {
      expect(warning.ratio).toBeLessThan(4.5);
      expect(warning.pair).toMatch(/ on (background|panel)$/);
    }
    // A design whose worked-out colors all read has nothing to report.
    for (const key of startingDesignKeys) {
      expect(derivedColorWarnings(startingDesign(key))).toEqual([]);
    }
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

  it('one height for anything a thumb taps: 44, in every design', () => {
    for (const key of startingDesignKeys) {
      expect(rem(designToCssVariables(startingDesign(key))['--tap'])).toBe(44);
    }
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
