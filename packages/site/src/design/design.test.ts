import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  contrastWarnings,
  designToCssText,
  designToCssVariables,
  nearestReadableColor,
  parseDesignDocument,
  startingDesign,
  startingDesignKeys,
} from '../../index.ts';

describe('design document', () => {
  it('accepts both starting designs', () => {
    for (const key of startingDesignKeys) {
      expect(parseDesignDocument(startingDesign(key)).ok).toBe(true);
    }
  });

  it('starting designs look different and have good contrast', () => {
    // The first one is the design a league opens with (C-16), then its light sibling.
    expect(startingDesignKeys).toEqual(['crest', 'crest-light', 'midnight-gold', 'clean-court']);
    const designs = startingDesignKeys.map(startingDesign);
    // No two share a page: every pair differs in its background, its panel and its text
    // or main color.
    for (const [i, a] of designs.entries()) {
      for (const b of designs.slice(i + 1)) {
        expect(a.colors.background).not.toBe(b.colors.background);
        expect(a.colors.panel).not.toBe(b.colors.panel);
        expect([a.colors.text, a.colors.primary]).not.toEqual([b.colors.text, b.colors.primary]);
      }
    }
    // The first design and its light sibling are one look on two pages: the same main
    // color and faces, a dark base and a light one.
    const [crest, crestLight] = [startingDesign('crest'), startingDesign('crest-light')];
    expect(crest.base).toBe('dark');
    expect(crestLight.base).toBe('light');
    expect(crestLight.colors.primary).toBe(crest.colors.primary);
    expect(crestLight.fonts).toEqual(crest.fonts);
    // The three looks differ from each other in base or main color, and in heading face.
    const looks = (['crest', 'midnight-gold', 'clean-court'] as const).map(startingDesign);
    for (const [i, a] of looks.entries()) {
      for (const b of looks.slice(i + 1)) {
        expect(a.colors.primary).not.toBe(b.colors.primary);
        expect(a.fonts.heading).not.toBe(b.fonts.heading);
      }
    }
    expect(looks[1]?.base).not.toBe(looks[2]?.base);
    expect(startingDesignKeys.flatMap((k) => contrastWarnings(startingDesign(k)))).toEqual([]);
  });

  it('the first starting design carries the colors it was built from (C-16)', () => {
    expect(startingDesign('crest').colors).toEqual({
      background: '#170e13',
      panel: '#24171e',
      text: '#f6f1e9',
      primary: '#96062d',
      accent: '#b77d8c',
      highlight: '#d3b780',
    });
    const light = startingDesign('crest-light').colors;
    expect([light.background, light.panel]).toEqual(['#fffefa', '#eee7e8']);
    expect([light.primary, light.accent]).toEqual(['#96062d', '#d3b780']);
    // A serif for titles, names and numbers; a plain sans for reading.
    expect(startingDesign('crest').fonts).toEqual({ heading: 'gelasio', body: 'source-sans' });
  });

  it('rejects bad colors, unknown fonts and web addresses', () => {
    const base = startingDesign('midnight-gold');
    expect(parseDesignDocument({ ...base, colors: { ...base.colors, text: 'red' } }).ok).toBe(
      false,
    );
    expect(
      parseDesignDocument({ ...base, fonts: { heading: 'https://x/y.woff', body: 'jost' } }).ok,
    ).toBe(false);
    expect(parseDesignDocument({ ...base, logo: 'https://evil/x.png' }).ok).toBe(false);
    expect(parseDesignDocument({ version: 2 }).ok).toBe(false);
  });
});

describe('contrast', () => {
  it('matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // #767676 on white is the well-known 4.54 borderline pass; #777777 is 4.48.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('throws on a bad color instead of passing', () => {
    expect(() => contrastRatio('red', '#ffffff')).toThrow();
    expect(() => contrastRatio('#fff', '#ffffff')).toThrow();
    expect(() => contrastRatio('#ggggggg', '#ffffff')).toThrow();
  });

  it('warns for the right pairs only', () => {
    const base = startingDesign('clean-court');
    // Light text on a light background and a light panel: both pairs fail.
    const both = { ...base, colors: { ...base.colors, text: '#f0f0f0' } };
    expect(contrastWarnings(both).map((w) => w.pair)).toEqual([
      'text on background',
      'text on panel',
    ]);
    // Only the panel is too close to the text.
    const panelOnly = {
      ...base,
      colors: {
        ...base.colors,
        highlight: '#14202b',
        text: '#14202b',
        background: '#ffffff',
        panel: '#1b2a38',
      },
    };
    // The highlight is the same dark colour here, so it fails on the panel too.
    expect(contrastWarnings(panelOnly).map((w) => w.pair)).toEqual([
      'text on panel',
      'highlight on panel',
    ]);
  });

  it('suggests the nearest readable shade', () => {
    const base = startingDesign('clean-court');
    const low = { ...base, colors: { ...base.colors, text: '#9a9a9a', background: '#ffffff' } };
    const [warning] = contrastWarnings(low);
    expect(warning?.suggestion).toBeDefined();
    expect(contrastRatio(warning?.suggestion ?? '#ffffff', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(nearestReadableColor('#445566', '#0b2233')).toMatch(/^#[0-9a-f]{6}$/);
    expect(
      contrastRatio(nearestReadableColor('#445566', '#0b2233'), '#0b2233'),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('highlight color (C-15)', () => {
  const base = startingDesign('clean-court');
  const { highlight: _dropped, ...noHighlight } = base.colors;
  it('both starting designs supply one', () => {
    for (const key of startingDesignKeys) {
      expect(startingDesign(key).colors.highlight).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it('accepts a design with and without one, and both produce the variable', () => {
    const without = { ...base, colors: noHighlight };
    expect(parseDesignDocument(base).ok).toBe(true);
    expect(parseDesignDocument(without).ok).toBe(true);
    expect(designToCssVariables(base)['--color-highlight']).toBe(base.colors.highlight);
    expect(designToCssVariables(without)['--color-highlight']).toBe(base.colors.accent);
    expect(designToCssText(without)).toContain('--color-highlight: #e8590c;');
  });
  it('rejects a bad highlight, and refuses a hostile one at the CSS step', () => {
    expect(parseDesignDocument({ ...base, colors: { ...base.colors, highlight: 'red' } }).ok).toBe(
      false,
    );
    const hostile = structuredClone(base) as unknown as { colors: { highlight: string } };
    hostile.colors.highlight = 'red;} body{display:none';
    expect(() => designToCssText(hostile as unknown as typeof base)).toThrow();
  });
  it('warns when the highlight (or the accent standing in for it) cannot be read', () => {
    const faint = { ...base, colors: { ...base.colors, highlight: '#f0f0f0' } };
    expect(contrastWarnings(faint).map((w) => w.pair)).toEqual([
      'highlight on background',
      'highlight on panel',
    ]);
    const [warning] = contrastWarnings(faint);
    expect(
      contrastRatio(warning?.suggestion ?? '#ffffff', base.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    // Left out, the accent stands in, so a readable accent is fine and a pale one warns.
    const darkAccent = { ...base, colors: { ...noHighlight, accent: '#14202b' } };
    expect(contrastWarnings(darkAccent)).toEqual([]);
    const paleAccent = { ...base, colors: { ...noHighlight, accent: '#f0f0f0' } };
    expect(contrastWarnings(paleAccent).map((w) => w.pair)).toEqual([
      'highlight on background',
      'highlight on panel',
    ]);
  });
});

describe('design to CSS variables (T-90)', () => {
  it('writes the named variables', () => {
    const vars = designToCssVariables(startingDesign('midnight-gold'));
    expect(vars['--color-primary']).toBe('#c8a84b');
    expect(vars['--font-heading']).toContain('Cinzel');
  });

  it('writes the color scheme for dark and light designs', () => {
    expect(designToCssVariables(startingDesign('midnight-gold'))['color-scheme']).toBe('dark');
    expect(designToCssVariables(startingDesign('clean-court'))['color-scheme']).toBe('light');
  });

  it('gives different output for different designs', () => {
    const texts = startingDesignKeys.map((k) => designToCssText(startingDesign(k)));
    expect(new Set(texts).size).toBe(startingDesignKeys.length);
    expect(texts[0]).toMatch(/^:root \{\n {2}--color-background: #170e13;/);
    expect(designToCssText(startingDesign('midnight-gold'))).toMatch(
      /^:root \{\n {2}--color-background: #0b2233;/,
    );
  });

  it('accepts only safe selectors', () => {
    const d = startingDesign('clean-court');
    expect(designToCssText(d, '.league-theme')).toMatch(/^\.league-theme \{/);
    expect(designToCssText(d, '[data-league="abc-1"]')).toMatch(/^\[data-league=/);
    for (const bad of ['', 'body', ':root, body', '} * {', '.a{', '[data-x=y]', 'div .a']) {
      expect(() => designToCssText(d, bad)).toThrow();
    }
  });

  it('refuses hostile values even when the schema was skipped', () => {
    const d = startingDesign('clean-court');
    const hostile = (change: (x: any) => void) => {
      const copy: any = structuredClone(d);
      change(copy);
      return () => designToCssText(copy);
    };
    expect(hostile((x) => (x.colors.primary = 'red;} body{display:none'))).toThrow();
    expect(hostile((x) => (x.colors.text = 'url(http://evil.example)'))).toThrow();
    expect(hostile((x) => (x.fonts.body = 'constructor'))).toThrow();
    expect(hostile((x) => (x.fonts.heading = '__proto__'))).toThrow();
    expect(hostile((x) => (x.corners = 'toString'))).toThrow();
    expect(hostile((x) => (x.cards = 'x; color: red'))).toThrow();
    expect(hostile((x) => (x.spacing = undefined))).toThrow();
    expect(hostile((x) => (x.base = 'dark; x'))).toThrow();
  });

  it('keeps links, names and hover swaps readable in every starting design', () => {
    for (const key of startingDesignKeys) {
      const { colors } = startingDesign(key);
      const vars = designToCssVariables(startingDesign(key));
      // What a variable stands for, followed through the variables it names.
      const colorOf = (name: string): string => {
        const value = vars[name] ?? '';
        const named = /^var\((--[a-z-]+)\)$/.exec(value)?.[1];
        return named === undefined ? value : colorOf(named);
      };
      for (const bg of [colors.background, colors.panel]) {
        // A link, and the color the eye lands on (a number, a score, a way on), are in
        // colors worked out to read here, whatever the league's main color is.
        for (const name of ['--color-primary-text', '--color-pop']) {
          expect(contrastRatio(colorOf(name), bg), `${key} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(colors.text, bg)).toBeGreaterThanOrEqual(4.5);
      }
      // The league's name, and the current page of the menu, in the header.
      const bar = colorOf('--header-background');
      for (const name of ['--header-name', '--header-text', '--tab-text']) {
        expect(contrastRatio(colorOf(name), bar), `${key} ${name}`).toBeGreaterThanOrEqual(4.5);
      }
      // The current page is written on the bar, or on its own filled pill.
      const pill = colorOf('--tab-current-background');
      expect(
        contrastRatio(colorOf('--tab-current-text'), pill === 'transparent' ? bar : pill),
        `${key} current page`,
      ).toBeGreaterThanOrEqual(4.5);
      // hover swaps text and background colors
      expect(contrastRatio(colors.background, colors.text)).toBeGreaterThanOrEqual(4.5);
    }
    // The two designs whose main color is itself their links' color: it reads as it is.
    for (const key of ['midnight-gold', 'clean-court'] as const) {
      const { colors } = startingDesign(key);
      for (const bg of [colors.background, colors.panel]) {
        expect(contrastRatio(colors.primary, bg), key).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
