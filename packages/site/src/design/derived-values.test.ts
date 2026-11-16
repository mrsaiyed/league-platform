// The values worked out from a design (step 2.85): colors that stay readable whatever a
// league chooses, the one spacing scale and the one type scale, and the frame of a dark
// design and of a light one.
import { describe, expect, it } from 'vitest';
import {
  bandSurfaces,
  contrastRatio,
  contrastWarnings,
  derivedColorWarnings,
  derivedColors,
  designToCssVariables,
  evenFigureFonts,
  fontKeys,
  headerSurfaces,
  headingTraits,
  scoreFont,
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

  // Step 2.147 (C-16): the color the eye lands on, a band's own colors, and the header's.
  it('give every starting design a color the eye lands on that reads, on the page and on a band', () => {
    for (const key of startingDesignKeys) {
      const design = startingDesign(key);
      const colors = colorsOf(design);
      const derived = derivedColors(colors, design.base);
      const reads = (text: string, surface: string, what: string) =>
        expect(contrastRatio(text, surface), `${key} ${what}`).toBeGreaterThanOrEqual(4.5);
      for (const surface of textSurfaces(colors)) reads(derived.pop, surface, 'pop on the page');
      reads(derived.onPop, derived.pop, 'words on pop');
      const band = bandSurfaces(colors, design.base);
      expect(derived).toMatchObject(band);
      for (const [where, surface] of Object.entries(band)) {
        reads(derived.onBand, surface, `words on ${where}`);
        reads(derived.bandMuted, surface, `quiet words on ${where}`);
        reads(derived.bandPop, surface, `pop on ${where}`);
      }
      // The one button that matters: its words read on its fill, still and hovered.
      reads(derived.onBandPop, derived.bandPop, 'words on the button');
      reads(derived.onBandPop, derived.bandPopHover, 'words on the hovered button');
      expect(derived.bandPopHover).not.toBe(derived.bandPop);
      for (const surface of headerSurfaces(colors, design.base)) {
        reads(derived.headerMuted, surface, 'the menu in the header');
        reads(derived.headerPop, surface, 'the current page in the header');
      }
      for (const value of Object.values(derived)) expect(value).toMatch(hex);
    }
  });

  it('gives the eye the main color where that reads, and the highlight where it does not', () => {
    const of = (key: (typeof startingDesignKeys)[number]) => {
      const design = startingDesign(key);
      return { colors: colorsOf(design), derived: derivedColors(colorsOf(design), design.base) };
    };
    // A gold on navy and a blue on white read as they are: numbers and the current page
    // stay in the league's main color.
    expect(of('midnight-gold').derived.pop).toBe(of('midnight-gold').colors.primary);
    expect(of('clean-court').derived.pop).toBe(of('clean-court').colors.primary);
    // A maroon on wine-black does not: the gold takes over, untouched.
    const crest = of('crest');
    expect(contrastRatio(crest.colors.primary, crest.colors.background)).toBeLessThan(4.5);
    expect(crest.derived.pop).toBe(crest.colors.highlight);
    expect(crest.derived.bandPop).toBe(crest.colors.highlight);
    expect(crest.derived.headerPop).toBe(crest.colors.highlight);
    // Its light sibling: maroon on the white page, and the same gold, untouched, wherever
    // the maroon is the ground (the header's bar, a band).
    const light = of('crest-light');
    expect(light.derived.pop).toBe(light.colors.primary);
    expect(light.derived.bandPop).toBe('#d3b780');
    expect(light.derived.headerPop).toBe('#d3b780');
  });

  it('makes a band from the main color: laid over a panel in a dark design, itself in a light one', () => {
    const crest = colorsOf(startingDesign('crest'));
    const dark = bandSurfaces(crest, 'dark');
    // A fifth of the maroon over the panel: the wine of the first design's bands.
    expect(dark.band).toBe(mixColors(crest.panel, crest.primary, 0.2));
    expect(dark.bandDeep).toBe(crest.background);
    // A bright main color is laid on thinly, so the panel does not turn to mud.
    const gold = colorsOf(startingDesign('midnight-gold'));
    expect(bandSurfaces(gold, 'dark').band).toBe(mixColors(gold.panel, gold.primary, 0.06));
    // A light design's band is its main color, deepened, and never lighter than it starts.
    const light = colorsOf(startingDesign('crest-light'));
    const bar = bandSurfaces(light, 'light');
    expect(bar.band).toBe(mixColors(light.primary, '#000000', 0.2));
    expect(bar.bandGlow).toBe(bar.band);
    expect(contrastRatio(bar.bandDeep, '#ffffff')).toBeGreaterThan(
      contrastRatio(bar.band, '#ffffff'),
    );
    // Left unsaid, the base is read from the page's own color.
    expect(bandSurfaces(crest)).toEqual(dark);
    expect(bandSurfaces(light)).toEqual(bar);
  });

  // Found by the code review of step 2.147's part 1 (M1): a light design's band was the
  // main color deepened by fixed shares, so a sky blue, a Carolina blue, a gold or a pale
  // yellow left its words under 4.5 to 1, and the band's eye-catching color collapsed into
  // the color of the words.
  it('a light design with a bright main color still gets a band its words read on', () => {
    const court = colorsOf(startingDesign('clean-court'));
    for (const primary of ['#3fa7d6', '#6cace4', '#ffc72c', '#f2d94e']) {
      const colors = { ...court, primary };
      // White words would not read on the color itself, nor on the old band.
      expect(contrastRatio('#ffffff', primary), primary).toBeLessThan(4.5);
      const derived = derivedColors(colors, 'light');
      for (const surface of [derived.band, derived.bandDeep, derived.bandGlow]) {
        expect(contrastRatio(derived.onBand, surface), primary).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(derived.bandPop, surface), primary).toBeGreaterThanOrEqual(4.5);
      }
      expect(derived.bandPop.toLowerCase(), primary).not.toBe(derived.onBand.toLowerCase());
      // The band is a dark ground of the text color with the main color in it, not the
      // main color turned to mud.
      expect(contrastRatio(derived.band, court.text), primary).toBeLessThan(2);
    }
    // A gold and a Carolina blue shine on their own bands as they are.
    expect(derivedColors({ ...court, primary: '#ffc72c' }, 'light').bandPop).toBe('#ffc72c');
    expect(derivedColors({ ...court, primary: '#6cace4' }, 'light').bandPop).toBe('#6cace4');
    // A main color that carries white words keeps the band it had: itself, a step deeper.
    expect(bandSurfaces(court, 'light').band).toBe(mixColors(court.primary, '#000000', 0.2));
  });

  /** A color from its hue (0 to 360), saturation and lightness (0 to 1). */
  const hsl = (h: number, s: number, l: number): string => {
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => {
      const k = (n + h / 30) % 12;
      const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(value * 255)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  };

  it('whatever main color a league chooses, light or dark: a band and a header that read, and a color of its own for the eye', () => {
    const bases = {
      light: [
        { background: '#ffffff', panel: '#ffffff', text: '#14202b' },
        { background: '#f7f8fa', panel: '#ffffff', text: '#14202b' },
        { background: '#fffefa', panel: '#f6f1e9', text: '#211c20' },
      ],
      dark: [
        { background: '#0b1420', panel: '#122033', text: '#eef2f5' },
        { background: '#170e13', panel: '#24171e', text: '#f6f1e9' },
        { background: '#000000', panel: '#161616', text: '#ffffff' },
      ],
    } as const;
    let checked = 0;
    for (const base of ['light', 'dark'] as const) {
      for (const ground of bases[base]) {
        for (let hue = 0; hue < 360; hue += 15) {
          for (const saturation of [1, 0.6, 0.2]) {
            for (const lightness of [0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95]) {
              const primary = hsl(hue, saturation, lightness);
              // The league's other two colors: an orange and a magenta; the main color's
              // opposite, pale and deep; and all three the same.
              const others = [
                { accent: '#e8590c', highlight: '#b4236b' },
                { accent: hsl(hue + 180, 0.7, 0.8), highlight: hsl(hue + 180, 0.7, 0.3) },
                { accent: primary, highlight: primary },
              ];
              for (const other of others) {
                const colors = { ...ground, primary, ...other };
                const derived = derivedColors(colors, base);
                const where = `${base} ${JSON.stringify(colors)}`;
                const reads = (text: string, surface: string, what: string) =>
                  expect(contrastRatio(text, surface), `${what}: ${where}`).toBeGreaterThanOrEqual(
                    4.5,
                  );
                for (const surface of [derived.band, derived.bandDeep, derived.bandGlow]) {
                  reads(derived.onBand, surface, 'words on a band');
                  reads(derived.bandMuted, surface, 'quiet words on a band');
                  reads(derived.bandPop, surface, 'the eye-catching color on a band');
                }
                expect(derived.bandPop.toLowerCase(), `a color of its own: ${where}`).not.toBe(
                  derived.onBand.toLowerCase(),
                );
                reads(derived.onBandPop, derived.bandPop, 'words on the one button');
                reads(derived.onBandPop, derived.bandPopHover, 'words on the hovered button');
                for (const surface of headerSurfaces(colors, base)) {
                  reads(derived.headerMuted, surface, 'the menu');
                  reads(derived.headerPop, surface, 'the current page');
                }
                for (const surface of textSurfaces(colors)) {
                  reads(derived.pop, surface, 'the eye-catching color on the page');
                }
                // A fine line shows on the page and on a panel, and is one of the league's
                // own colors laid on the page.
                for (const surface of [colors.background, colors.panel]) {
                  expect(
                    contrastRatio(derived.ornamentLine, surface),
                    `a fine line: ${where}`,
                  ).toBeGreaterThanOrEqual(Math.min(1.6, contrastRatio(derived.ornament, surface)));
                }
                expect([colors.primary, colors.accent, colors.highlight]).toContain(
                  derived.ornament,
                );
                checked += 1;
              }
            }
          }
        }
      }
    }
    // 2 bases, 3 grounds, 24 hues, 3 saturations, 7 lightnesses, 3 sets of other colors.
    expect(checked).toBe(2 * 3 * 24 * 3 * 7 * 3);
  });

  it('spends the league’s gold where it need not be read: fine decoration, as the league chose it', () => {
    const of = (key: (typeof startingDesignKeys)[number]) => {
      const design = startingDesign(key);
      return { colors: colorsOf(design), derived: derivedColors(colorsOf(design), design.base) };
    };
    // Both designs of the first look: the gold, untouched, though on the light one's white
    // page it could never be text.
    expect(of('crest').derived.ornament).toBe('#d3b780');
    expect(of('crest-light').derived.ornament).toBe('#d3b780');
    expect(contrastRatio('#d3b780', of('crest-light').colors.background)).toBeLessThan(3);
    // The same color as a fine line: about a third of it on a dark page, most of it on a
    // white one, and either way seen.
    const dark = of('crest');
    expect(dark.derived.ornamentLine).toBe(mixColors(dark.colors.background, '#d3b780', 0.3));
    const light = of('crest-light');
    expect(light.derived.ornamentLine).not.toBe(mixColors(light.colors.background, '#d3b780', 0.3));
    for (const { colors, derived } of [dark, light, of('midnight-gold'), of('clean-court')]) {
      for (const surface of [colors.background, colors.panel]) {
        expect(contrastRatio(derived.ornamentLine, surface)).toBeGreaterThanOrEqual(1.6);
      }
    }
    // A design whose main color is what the eye lands on keeps its lines in it.
    expect(of('midnight-gold').derived.ornament).toBe(of('midnight-gold').colors.primary);
    const vars = designToCssVariables(startingDesign('crest-light'));
    expect(vars['--color-ornament']).toBe('#d3b780');
    expect(vars['--color-ornament-line']).toBe(light.derived.ornamentLine);
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
      expect(warning.pair).toMatch(/ on (hovered )?(background|panel)$/);
    }
    // A design whose worked-out colors all read has nothing to report.
    for (const key of startingDesignKeys) {
      expect(derivedColorWarnings(startingDesign(key))).toEqual([]);
    }
  });

  it('checks the hovered surfaces too, the ones the colors are fitted to', () => {
    // A text color that only just reads on its panel, and a strong main color: on a hovered
    // row (the main color laid over the panel) the text falls short. The plain check of
    // text on the panel as it is passes, so only this one can say so.
    const base = startingDesign('clean-court');
    const design = {
      ...base,
      colors: { ...base.colors, panel: '#ffffff', text: '#767676', primary: '#000000' },
    };
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    const hovered = hoveredSurface('#ffffff', '#000000');
    expect(contrastRatio('#767676', hovered)).toBeLessThan(4.5);
    expect(contrastWarnings(design).map((w) => w.pair)).not.toContain('text on panel');
    const pairs = derivedColorWarnings(design).map((w) => w.pair);
    expect(pairs).toContain('text on hovered panel');
    // Every worked-out color is checked on all four surfaces it is fitted to.
    const apart = {
      ...base,
      colors: { ...base.colors, background: '#ffffff', panel: '#0f2c40' },
    };
    const where = new Set(
      derivedColorWarnings(apart).map((w) => w.pair.slice(w.pair.indexOf(' on ') + 4)),
    );
    expect([...where].some((surface) => surface.startsWith('hovered '))).toBe(true);
    expect([...where].some((surface) => !surface.startsWith('hovered '))).toBe(true);
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

  it('one type scale: 12, 14, 16, 18, 22, 28, 36, and 48, 64, 88 for display', () => {
    const vars = designToCssVariables(startingDesign('midnight-gold'));
    const sizes = [12, 14, 16, 18, 22, 28, 36, 48, 64, 88];
    expect(sizes.map((n) => rem(vars[`--text-${n}`]))).toEqual(sizes);
    // And nothing between: these are all the sizes there are.
    expect(Object.keys(vars).filter((name) => name.startsWith('--text-'))).toEqual(
      sizes.map((n) => `--text-${n}`),
    );
  });

  it('one height for anything a thumb taps: 44, in every design', () => {
    for (const key of startingDesignKeys) {
      expect(rem(designToCssVariables(startingDesign(key))['--tap'])).toBe(44);
    }
  });

  it('one heavier line, 2 pixels, in every design', () => {
    for (const key of startingDesignKeys) {
      expect(designToCssVariables(startingDesign(key))['--line-heavy']).toBe('2px');
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

  // Step 2.147: the frame follows a design's base, its corners and its heading face.
  const crest = designToCssVariables(startingDesign('crest'));
  const crestLight = designToCssVariables(startingDesign('crest-light'));

  it('draws hairlines in the text color where a dark design’s main color is too deep to show', () => {
    // Gold on navy shows as a line; maroon on wine-black does not.
    expect(dark['--color-line']).toContain('var(--color-primary)');
    expect(crest['--color-line']).toContain('var(--color-text)');
    for (const vars of [crest, crestLight]) {
      const found = /color-mix\(in srgb, var\(--color-text\) (\d+)%, transparent\)/.exec(
        vars['--color-line'] ?? '',
      );
      expect(Number(found?.[1])).toBeGreaterThanOrEqual(12);
      expect(Number(found?.[1])).toBeLessThanOrEqual(25);
    }
  });

  it('writes the menu as small widely spaced capitals unless the corners are round', () => {
    for (const vars of [crest, crestLight, dark]) {
      expect(vars['--tab-case']).toBe('uppercase');
      expect(vars['--tab-size']).toBe('var(--text-12)');
      expect(vars['--tab-current-background']).toBe('transparent');
      expect(vars['--tab-text']).toBe('var(--header-muted)');
    }
    // The current page: a line in the header's eye-catching color; a dark design whose
    // main color shows on the page keeps it in that.
    expect(crest['--tab-current-line']).toBe('var(--header-pop)');
    expect(crestLight['--tab-current-line']).toBe('var(--header-pop)');
    expect(crest['--header-name']).toBe('var(--color-text)');
    // Its light sibling keeps the bar of the main color every light design has.
    expect(crestLight['--header-background']).toBe('var(--color-primary)');
    expect(light['--tab-size']).toBe('var(--text-14)');
    expect(light['--tab-radius']).toBe('var(--radius-pill)');
  });

  it('sets titles as their face is drawn: a serif light and close, capitals only where a face is made of them', () => {
    expect(crest).toMatchObject({
      '--heading-weight': '500',
      '--display-weight': '400',
      '--heading-case': 'none',
      '--hero-case': 'uppercase',
      '--brand-case': 'uppercase',
    });
    expect(dark['--heading-case']).toBe('uppercase');
    expect(light).toMatchObject({ '--heading-case': 'none', '--hero-case': 'none' });
    // Every face of the list has its traits, each a plain value: a case, a weight, a
    // distance written as a length (so a stylesheet can halve it), or a letter's width as
    // a share of its size.
    for (const key of fontKeys) {
      for (const value of Object.values(headingTraits[key])) {
        expect(value, key).toMatch(/^(uppercase|none|\d{3}|0em|0\.\d+em|0\.\d+)$/);
      }
      const width = Number(headingTraits[key].letterWidth);
      expect(width, key).toBeGreaterThanOrEqual(0.45);
      expect(width, key).toBeLessThanOrEqual(0.9);
    }
    // A face of capitals set wide needs more room for a name than a serif set close.
    expect(Number(dark['--heading-letter'])).toBeGreaterThan(Number(crest['--heading-letter']));
  });

  it('gives a dark design a card warmed by its main color, and a light one a card of one tint with its tables', () => {
    for (const vars of [crest, dark]) {
      // Never more of the main color than the texts are fitted to.
      const share =
        /color-mix\(in srgb, var\(--color-primary\) (\d+)%, var\(--color-panel\)\)/.exec(
          vars['--card-wash'] ?? '',
        )?.[1];
      expect(Number(share) / 100).toBeLessThanOrEqual(hoverTintShare);
      expect(vars['--emblem-strength']).toBe('30%');
    }
    // On a white panel a main color laid over it turns dusty (a maroon turns pink): none.
    for (const vars of [crestLight, light]) {
      expect(vars['--card-wash']).toBe('var(--color-panel)');
      // And a team's color needs more of itself to have the strength it has on a dark panel.
      expect(vars['--emblem-strength']).toBe('55%');
    }
  });

  it('softens the first leader card in a light design, and leaves it a small band in a dark one', () => {
    const spot = (vars: Record<string, string>) =>
      Object.keys(vars).filter((name) => name.startsWith('--spot-'));
    // A dark design says nothing: the shared pieces' own default is the band's colors.
    for (const vars of [crest, dark]) expect(spot(vars)).toEqual([]);
    // In any design: a shield on the first card is drawn thinly, over nothing, only where
    // the card itself is the panel (where every shield is drawn so). On a filled card it
    // always keeps its team's own color.
    for (const vars of [crest, dark, crestLight, light]) {
      if (vars['--spot-shield-under'] !== 'transparent') {
        expect(vars['--spot-shield-under']).toBeUndefined();
        continue;
      }
      expect(vars['--spot-ground']).toBe('var(--color-panel)');
      expect(vars['--spot-shield-share']).toBe(vars['--emblem-strength']);
    }
    for (const vars of [crestLight, light]) {
      // The panel, with no more of the main color than every text is fitted to, an edge
      // of the main color no stronger than a picked-out card's, and the page's own words
      // and color for the eye: nothing here is a band's.
      expect(vars['--spot-ground']).toBe('var(--color-panel)');
      const share =
        /color-mix\(in srgb, var\(--color-primary\) (\d+)%, var\(--color-panel\)\)/.exec(
          vars['--spot-glow'] ?? '',
        )?.[1];
      expect(Number(share) / 100).toBeLessThanOrEqual(hoverTintShare);
      const edge = /color-mix\(in srgb, var\(--color-primary\) (\d+)%, transparent\)/.exec(
        vars['--spot-edge'] ?? '',
      )?.[1];
      expect(Number(edge)).toBeLessThanOrEqual(50);
      expect(vars).toMatchObject({
        '--spot-words': 'var(--color-text)',
        '--spot-muted': 'var(--color-muted)',
        '--spot-pop': 'var(--color-pop)',
        '--spot-letter': 'var(--color-text)',
        '--spot-shield-under': 'transparent',
      });
      // A shield on it is drawn as on any panel of the design.
      expect(vars['--spot-shield-share']).toBe(vars['--emblem-strength']);
      // No value names a variable that only a piece of the page has (a value is worked
      // out where it is written, at the top of the page).
      for (const name of spot(vars)) expect(vars[name], name).not.toMatch(/--emblem-|--team-/);
    }
  });

  it('sets a score only in a face with lining, even-width figures', () => {
    expect(scoreFont({ heading: 'gelasio', body: 'source-sans' })).toBe('gelasio');
    // Cinzel and Playfair Display have no even-width figures: the body face is used.
    expect(scoreFont({ heading: 'cinzel', body: 'jost' })).toBe('jost');
    expect(scoreFont({ heading: 'playfair-display', body: 'inter' })).toBe('inter');
    expect(scoreFont({ heading: 'oswald', body: 'cinzel' })).toBe('source-sans');
    for (const key of fontKeys) {
      for (const body of fontKeys) {
        expect(evenFigureFonts).toContain(scoreFont({ heading: key, body }));
      }
    }
    expect(crest['--font-score']).toBe(crest['--font-heading']);
    expect(dark['--font-score']).toBe(dark['--font-body']);
  });

  it('gives the two starting designs different corners, and both a pill', () => {
    expect(dark['--radius']).not.toBe(light['--radius']);
    expect(dark['--radius-pill']).toBe('999px');
    expect(
      designToCssVariables({ ...startingDesign('clean-court'), corners: 'sharp' }),
    ).toMatchObject({ '--radius': '0px', '--radius-small': '0px', '--radius-pill': '0px' });
  });
});
