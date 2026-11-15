// Colors worked out from the six a league chooses, so its own colors drop into a finished
// layout (docs/build/DESIGN.md, section 3). Each is a plain #rrggbb value, so the contrast
// of the text that uses it can be measured on the page.
import { contrastRatio, nearestReadableColor, type ContrastWarning } from './contrast.ts';
import type { DesignDocument } from './design-document.ts';

const MINIMUM = 4.5;

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** `a` with `share` (0 to 1) of `b` mixed in. */
export function mixColors(a: string, b: string, share: number): string {
  const from = channels(a);
  const to = channels(b);
  const mixed = from.map((v, i) => Math.round(v + ((to[i] ?? 0) - v) * share));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** How `color` reads on the one of `surfaces` it reads worst on. */
const weakestOn = (color: string, surfaces: readonly string[]): number =>
  Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

/** Whether `color` reads as text (4.5 to 1) on every one of `surfaces`. */
export const readsOn = (color: string, surfaces: readonly string[]): boolean =>
  weakestOn(color, surfaces) >= MINIMUM;

/**
 * `color`, moved only as far as it must be to read as text on every one of `surfaces`. It
 * goes on until it reads. Where nothing can (a light page with a dark panel: no one color
 * reads on both), it gives the ink that reads best on its worst surface, and `readsOn`
 * says it still falls short, which `derivedColorWarnings` lists for the design editor's
 * save to report once that exists.
 */
export function readableOn(color: string, surfaces: readonly string[]): string {
  let shade = color;
  for (let round = 0; round < 8 && !readsOn(shade, surfaces); round++) {
    const hardest = surfaces.reduce((worst, surface) =>
      contrastRatio(shade, surface) < contrastRatio(shade, worst) ? surface : worst,
    );
    shade = nearestReadableColor(shade, hardest);
  }
  if (readsOn(shade, surfaces)) return shade;
  return [shade, '#000000', '#ffffff'].reduce((best, ink) =>
    weakestOn(ink, surfaces) > weakestOn(best, surfaces) ? ink : best,
  );
}

/** The text color for words written on a filled `fill`: the design's own where one reads. */
export function textOn(fill: string, candidates: readonly string[]): string {
  const best = candidates.reduce((a, b) =>
    contrastRatio(b, fill) > contrastRatio(a, fill) ? b : a,
  );
  if (contrastRatio(best, fill) >= MINIMUM) return best;
  return contrastRatio('#ffffff', fill) >= contrastRatio('#000000', fill) ? '#ffffff' : '#000000';
}

/** The red of a destructive action or an error, before it is fitted to a design's surfaces. */
const dangerRed = '#c62f3a';

export type DerivedColors = {
  /** Quiet text: dates, column headings, help text. */
  readonly muted: string;
  /** The main color as text (links, the league's name), readable on the page and on a panel. */
  readonly primaryText: string;
  /** The accent as text (small labels), readable on the page and on a panel. */
  readonly accentText: string;
  /** Words on something filled with the main color (the main button, the light header). */
  readonly onPrimary: string;
  /** Words on something filled with the highlight (the Live pill). */
  readonly onHighlight: string;
  /** A destructive action or an error, readable on the page and on a panel. */
  readonly danger: string;
  readonly onDanger: string;
  /**
   * The main color under the pointer, where words in `onPrimary` are written on it (a tab of
   * the light header): moved away from those words, so they read at least as well as before.
   */
  readonly primaryHover: string;
};

type ChosenColors = {
  readonly background: string;
  readonly panel: string;
  readonly text: string;
  readonly primary: string;
  readonly accent: string;
  readonly highlight: string;
};

/**
 * How much of the main color is laid over a surface under the pointer (a row of a table, a
 * button): the stronger of the two frames' tints (frame-look.ts).
 */
export const hoverTintShare = 0.09;

/** How far the main color moves under the pointer where words are written on it. */
const primaryHoverShare = 0.18;

/** A surface with the pointer over it: the main color laid over it at low strength. */
export const hoveredSurface = (surface: string, primary: string): string =>
  mixColors(surface, primary, hoverTintShare);

/**
 * Every surface text is read on: the page and a panel, each as it is and with the pointer
 * over it. The colors worked out below are fitted to all four, so a hovered row or button
 * reads as well as a still one.
 */
export const textSurfaces = (colors: ChosenColors): readonly string[] => [
  colors.background,
  colors.panel,
  hoveredSurface(colors.background, colors.primary),
  hoveredSurface(colors.panel, colors.primary),
];

export function derivedColors(colors: ChosenColors): DerivedColors {
  const surfaces = textSurfaces(colors);
  const inks = [colors.panel, colors.background, colors.text];
  const danger = readableOn(dangerRed, surfaces);
  const onPrimary = textOn(colors.primary, inks);
  // Away from the words on it: darker under light words, lighter under dark ones.
  const awayFromWords =
    contrastRatio(onPrimary, '#000000') >= contrastRatio(onPrimary, '#ffffff')
      ? '#000000'
      : '#ffffff';
  return {
    muted: readableOn(mixColors(colors.text, colors.background, 0.35), surfaces),
    primaryText: readableOn(colors.primary, surfaces),
    accentText: readableOn(colors.accent, surfaces),
    onPrimary,
    onHighlight: textOn(colors.highlight, inks),
    danger,
    onDanger: textOn(danger, inks),
    primaryHover: mixColors(colors.primary, awayFromWords, primaryHoverShare),
  };
}

/**
 * The colors worked out from a design that still cannot be read where they are used, on
 * each of the four surfaces they are fitted to: the page and a panel, as they are and
 * with the pointer over them. That happens only when a design's surfaces are so far apart
 * (a light page with a dark panel) that no one color reads on all of them. The league's
 * own text color is checked on the two hovered surfaces too: `contrastWarnings` checks it
 * on the page and the panel as they are.
 *
 * Nothing calls this yet: no design is saved anywhere until the design editor exists.
 * The editor's save is to report these beside `contrastWarnings`, so no color falls short
 * without saying so.
 */
export function derivedColorWarnings(design: DesignDocument): ContrastWarning[] {
  const colors = { ...design.colors, highlight: design.colors.highlight ?? design.colors.accent };
  const derived = derivedColors(colors);
  const still: [string, string][] = [
    ['background', colors.background],
    ['panel', colors.panel],
  ];
  const hovered: [string, string][] = still.map(([where, surface]) => [
    `hovered ${where}`,
    hoveredSurface(surface, colors.primary),
  ]);
  const everywhere = [...still, ...hovered];
  const checks: [string, string, [string, string][]][] = [
    ['quiet text', derived.muted, everywhere],
    ['main color as text', derived.primaryText, everywhere],
    ['accent as text', derived.accentText, everywhere],
    ['error text', derived.danger, everywhere],
    ['text', colors.text, hovered],
  ];
  return checks.flatMap(([name, text, surfaces]) =>
    surfaces
      .map(([where, surface]) => ({
        pair: `${name} on ${where}`,
        ratio: contrastRatio(text, surface),
        minimum: MINIMUM,
        suggestion: nearestReadableColor(text, surface),
      }))
      .filter((warning) => warning.ratio < warning.minimum),
  );
}
