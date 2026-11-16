// The staff area's look (step 2.103): calm and light under any league's colors, with a
// side menu in a dark shade of the league's main color, and every word on it readable.
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  designDocumentSchema,
  staffColors,
  staffCssText,
  staffCssVariables,
  staffDesignOf,
  startingDesign,
  startingDesignKeys,
  type DesignDocument,
} from '../../index.ts';

const hex = /^#[0-9a-f]{6}$/;
/** The starting designs, and the same design under main colors of every kind. */
const mains = ['#96062d', '#1f5fbf', '#c8a84b', '#1e7f5c', '#ffd400', '#0a0a0a', '#f2f2f2'];
const designs: readonly DesignDocument[] = [
  ...startingDesignKeys.map((key) => startingDesign(key)),
  ...mains.map((primary) => {
    const base = startingDesign('crest');
    return { ...base, colors: { ...base.colors, primary } };
  }),
];

describe('the staff area’s design', () => {
  it('is a light, calm workspace whatever the league’s own design is', () => {
    for (const design of designs) {
      const staff = staffDesignOf(design);
      expect(designDocumentSchema.safeParse(staff).success).toBe(true);
      expect(staff.base).toBe('light');
      expect(staff.colors.primary).toBe(design.colors.primary);
      // A pale page and white panels; dark words that read on both.
      expect(contrastRatio(staff.colors.background, '#ffffff')).toBeLessThan(1.2);
      expect(contrastRatio(staff.colors.text, staff.colors.background)).toBeGreaterThan(10);
      expect(contrastRatio(staff.colors.text, staff.colors.panel)).toBeGreaterThan(10);
      // One reading face for titles and words; soft corners and outlined cards.
      expect(staff.fonts.heading).toBe(design.fonts.body);
      expect(staff.corners).toBe('soft');
      expect(staff.cards).toBe('outlined');
    }
  });

  it('gives the menu a dark shade of the main color, with words that read on it', () => {
    for (const design of designs) {
      const colors = staffColors(design);
      const label = design.colors.primary;
      for (const value of Object.values(colors)) expect(value, label).toMatch(hex);
      expect(contrastRatio(colors.menu, '#ffffff'), label).toBeGreaterThanOrEqual(11);
      expect(contrastRatio(colors.menuText, colors.menu), label).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(colors.menuMuted, colors.menu), label).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.menuText, colors.menuHover), label).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(colors.onMenuCurrent, colors.menuCurrent), label).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('gives a state’s pill words that read on its soft ground and on a panel', () => {
    for (const design of designs) {
      const colors = staffColors(design);
      const vars = staffCssVariables(design);
      for (const [words, ground] of [
        [colors.good, colors.goodSoft],
        [colors.wait, colors.waitSoft],
        [vars['--color-danger'] ?? '', colors.dangerSoft],
      ] as const) {
        expect(contrastRatio(words, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(words, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('writes one block of variables: the design’s own, then the staff area’s', () => {
    const text = staffCssText(startingDesign('crest'));
    expect(text.startsWith(':root {\n')).toBe(true);
    expect(text).toContain('--color-primary: #96062d;');
    expect(text).toContain('color-scheme: light;');
    expect(text).toMatch(/--staff-menu: #[0-9a-f]{6};/);
    // Nothing a league typed reaches the text: colors, known font stacks, fixed keywords.
    expect(text).not.toMatch(/[<>]|url\(|@import|expression/i);
  });
});
