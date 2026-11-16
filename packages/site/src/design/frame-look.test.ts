// The frame's rules for any league's colors, not only the designs that are pictured: the
// edge of every control stands 3 to 1 from what it is drawn on (WCAG 1.4.11), and the words
// of every state's pill read 4.5 to 1 on the pill's own ground. Each color set is turned
// into the variables a page would get, and the check reads those variables: the design's
// own rule, end to end. If a color set fails here, the rule is wrong, not the test.
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  designToCssVariables,
  headerSurfaces,
  mixColors,
  startingDesign,
  tintShares,
  type DesignDocument,
} from '../../index.ts';

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

// A page, a panel and a text color for each kind of design: white, off-white and cream;
// navy, wine-black and black.
const grounds = {
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
const hues = Array.from({ length: 12 }, (_, n) => n * 30);
const saturations = [1, 0.6, 0.2];
const lightnesses = [0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95];
/**
 * The league's other two colors beside a main color: an orange and a magenta; the main
 * color's opposite, pale and deep; two mid tones a quarter turn away, the hardest to read
 * on anything; and all three the same.
 */
const othersOf = (hue: number, primary: string) => [
  { accent: '#e8590c', highlight: '#b4236b' },
  { accent: hsl(hue + 180, 0.7, 0.8), highlight: hsl(hue + 180, 0.7, 0.3) },
  { accent: hsl(hue + 90, 0.5, 0.5), highlight: hsl(hue + 270, 0.9, 0.6) },
  { accent: primary, highlight: primary },
];

type Base = 'light' | 'dark';
type Colors = DesignDocument['colors'] & { readonly highlight: string };

/** Every color set of the sweep for one kind of design. */
function* colorSets(base: Base): Generator<Colors> {
  for (const ground of grounds[base]) {
    for (const hue of hues) {
      for (const saturation of saturations) {
        for (const lightness of lightnesses) {
          const primary = hsl(hue, saturation, lightness);
          for (const other of othersOf(hue, primary)) yield { ...ground, primary, ...other };
        }
      }
    }
  }
}
const setsPerBase = 3 * 12 * 3 * 7 * 4;

/** The variables a page gets for a league of these colors, in a design of this kind. */
const variablesOf = (base: Base, colors: Colors): Record<string, string> =>
  designToCssVariables({
    ...startingDesign(base === 'dark' ? 'crest' : 'crest-light'),
    base,
    colors,
  });

/**
 * Every color set of one kind of design with its variables, worked out once and read by
 * both tests below.
 */
const worked = new Map<Base, readonly (readonly [Colors, Record<string, string>])[]>();
function workedOut(base: Base): readonly (readonly [Colors, Record<string, string>])[] {
  const known = worked.get(base);
  if (known !== undefined) return known;
  const all = [...colorSets(base)].map((colors) => [colors, variablesOf(base, colors)] as const);
  worked.set(base, all);
  return all;
}

/** The share (0 to 1) at which a variable lays `ink` on, as the stylesheet writes it. */
const shareIn = (vars: Record<string, string>, name: string, ink: string): number =>
  Number(new RegExp(`var\\(${ink}\\) (\\d+)%`).exec(vars[name] ?? '')?.[1]) / 100;

describe.each(['light', 'dark'] as const)('any league colors in a %s design', (base) => {
  it('gives every control an edge that stands 3 to 1 from its ground', () => {
    let checked = 0;
    for (const [colors, vars] of workedOut(base)) {
      const where = `${base} ${JSON.stringify(colors)}`;
      const stands = (ink: string, surface: string, share: number, what: string) =>
        expect(
          contrastRatio(mixColors(surface, ink, share), surface),
          `${what}: ${where}`,
        ).toBeGreaterThanOrEqual(3);
      // A field, a picker, an outlined button on the page or on a panel: the text color,
      // never under 45 percent.
      const control = shareIn(vars, '--color-line-strong', '--color-text');
      expect(control, where).toBeGreaterThanOrEqual(0.45);
      expect(control, where).toBeLessThanOrEqual(1);
      for (const surface of [colors.background, colors.panel]) {
        stands(colors.text, surface, control, "a control's edge");
      }
      // In the header (the menu's button, the season picker, the account button): the
      // color of the header's words, never under 40 percent, on the bar as it is and under
      // the pointer.
      const headerText = base === 'dark' ? colors.text : (vars['--color-on-primary'] ?? '');
      const inHeader = shareIn(vars, '--header-edge', '--header-text');
      expect(inHeader, where).toBeGreaterThanOrEqual(0.4);
      expect(inHeader, where).toBeLessThanOrEqual(1);
      for (const surface of headerSurfaces(colors, base)) {
        stands(headerText, surface, inHeader, 'an edge in the header');
      }
      // On a band (the outlined button beside the one that matters): the color of the
      // band's words, on the band where it starts, where it ends and at its glow.
      const onBand = shareIn(vars, '--band-edge', '--color-on-band');
      expect(onBand, where).toBeGreaterThanOrEqual(0.4);
      expect(onBand, where).toBeLessThanOrEqual(1);
      for (const name of ['--color-band', '--color-band-deep', '--color-band-glow']) {
        stands(vars['--color-on-band'] ?? '', vars[name] ?? '', onBand, 'an edge on a band');
      }
      checked += 1;
    }
    // 3 grounds, 12 hues, 3 saturations, 7 lightnesses, 4 sets of other colors.
    expect(checked).toBe(setsPerBase);
  });

  it('gives every pill words that read 4.5 to 1 on its ground', () => {
    let checked = 0;
    for (const [colors, vars] of workedOut(base)) {
      const where = `${base} ${JSON.stringify(colors)}`;
      const reads = (text: string | undefined, surface: string, what: string) =>
        expect(contrastRatio(text ?? '', surface), `${what}: ${where}`).toBeGreaterThanOrEqual(4.5);
      // Postponed, Forfeit, Cancelled on a card and on a game's big board: the accent as
      // text on the panel with the frame's tint in it, one solid ground.
      const onPanel = shareIn(vars, '--color-tint-panel', '--color-primary');
      expect(onPanel, where).toBe(tintShares[base]);
      reads(
        vars['--color-accent-text'],
        mixColors(colors.panel, colors.primary, onPanel),
        'a soft pill on a card',
      );
      // The same words beside a round's name ("1 game postponed"): the see-through tint,
      // over the page or over a panel.
      const tint = shareIn(vars, '--color-tint', '--color-primary');
      expect(tint, where).toBe(tintShares[base]);
      for (const surface of [colors.background, colors.panel]) {
        reads(
          vars['--color-accent-text'],
          mixColors(surface, colors.primary, tint),
          "a soft pill beside a round's name",
        );
      }
      // Final and "Awaiting result": quiet words on the card or the page itself.
      for (const surface of [colors.background, colors.panel]) {
        reads(vars['--color-muted'], surface, 'a quiet pill');
      }
      // Live: its own words on the highlight.
      reads(vars['--color-on-highlight'], colors.highlight, 'the Live pill');
      checked += 1;
    }
    expect(checked).toBe(setsPerBase);
  });
});
