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
    const [a, b] = startingDesignKeys.map(startingDesign);
    expect(a?.base).not.toBe(b?.base);
    expect(a?.colors.primary).not.toBe(b?.colors.primary);
    expect(a?.fonts.heading).not.toBe(b?.fonts.heading);
    expect(startingDesignKeys.flatMap((k) => contrastWarnings(startingDesign(k)))).toEqual([]);
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
      colors: { ...base.colors, text: '#14202b', background: '#ffffff', panel: '#1b2a38' },
    };
    expect(contrastWarnings(panelOnly).map((w) => w.pair)).toEqual(['text on panel']);
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
    const [a, b] = startingDesignKeys.map((k) => designToCssText(startingDesign(k)));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^:root \{\n {2}--color-background: #0b2233;/);
  });

  it('accepts only safe selectors', () => {
    const d = startingDesign('clean-court');
    expect(designToCssText(d, '.league-theme')).toMatch(/^\.league-theme \{/);
    expect(designToCssText(d, '[data-league="abc-1"]')).toMatch(/^\[data-league=/);
    for (const bad of ['', 'body', ':root, body', '} * {', '.a{', '[data-x=y]', 'div .a']) {
      expect(() => designToCssText(d, bad)).toThrow();
    }
  });
});
