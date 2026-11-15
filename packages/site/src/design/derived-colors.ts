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
  /**
   * The color the eye should land on, as text on the page and on a panel: a big number, a
   * score, the way on beside a title (C-16). It is the main color where that reads as it
   * is; a main color too deep or too pale to read gives the job to the highlight, and then
   * to the accent. Never moved unless none of the three reads.
   */
  readonly pop: string;
  /** Words on something filled with `pop`. */
  readonly onPop: string;
  /**
   * A band: the hero, the call to action near the foot, a card picked out from its row. In
   * a dark design it is a panel with the main color laid over it, fading into the page; in
   * a light one it is the main color itself, deepening. `band` is where it starts,
   * `bandDeep` where it ends and `bandGlow` the strongest it gets under its pattern.
   */
  readonly band: string;
  readonly bandDeep: string;
  readonly bandGlow: string;
  /** Words on a band, quiet words on a band, and the color the eye should land on there. */
  readonly onBand: string;
  readonly bandMuted: string;
  readonly bandPop: string;
  /** Words on something filled with `bandPop` (the one button that matters), and its hover. */
  readonly onBandPop: string;
  readonly bandPopHover: string;
  /** In the header: quiet words (the menu) and the color of the current page and the way in. */
  readonly headerMuted: string;
  readonly headerPop: string;
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

/**
 * How much of the main color is laid over a panel to make a dark design's band, and how
 * much more its glow adds at its strongest. A deep main color (a maroon, a forest green)
 * is laid on generously, which is where the page gets its warmth. A bright one (a gold) is
 * laid on thinly: more of it would turn the panel to mud.
 */
const bandShares = { deep: { band: 0.2, glow: 0.3 }, bright: { band: 0.06, glow: 0.1 } } as const;
/** A light design's band is the main color deepened this far where it starts and ends. */
const lightBandShares = { band: 0.2, deep: 0.5 } as const;

/** A design is dark when its page is: said by the design, or read from the page's color. */
function isDark(colors: ChosenColors, base: 'light' | 'dark' | undefined): boolean {
  if (base !== undefined) return base === 'dark';
  return contrastRatio(colors.background, '#ffffff') > contrastRatio(colors.background, '#000000');
}

/** The first of `candidates` that reads on every one of `surfaces` as it is. */
const firstThatReads = (
  candidates: readonly string[],
  surfaces: readonly string[],
): string | undefined => candidates.find((color) => readsOn(color, surfaces));

/** The surfaces of a band: where it starts, where it ends and its glow. */
export function bandSurfaces(
  colors: ChosenColors,
  base?: 'light' | 'dark',
): { readonly band: string; readonly bandDeep: string; readonly bandGlow: string } {
  if (isDark(colors, base)) {
    const shares = readsOn(colors.primary, textSurfaces(colors))
      ? bandShares.bright
      : bandShares.deep;
    const band = mixColors(colors.panel, colors.primary, shares.band);
    return {
      band,
      bandDeep: colors.background,
      bandGlow: mixColors(band, colors.primary, shares.glow),
    };
  }
  // A light design's band is the main color a step deeper than its header's bar, and only
  // ever deepens from there: it has no lighter glow, so the color the eye lands on can stay
  // strong on it.
  const band = mixColors(colors.primary, '#000000', lightBandShares.band);
  return {
    band,
    bandDeep: mixColors(colors.primary, '#000000', lightBandShares.deep),
    bandGlow: band,
  };
}

/**
 * The surfaces of the header: the page in a dark design; in a light one a bar of the main
 * color, as it is and under the pointer.
 */
export function headerSurfaces(colors: ChosenColors, base?: 'light' | 'dark'): readonly string[] {
  if (isDark(colors, base)) return [colors.background];
  const onPrimary = textOn(colors.primary, [colors.panel, colors.background, colors.text]);
  const away =
    contrastRatio(onPrimary, '#000000') >= contrastRatio(onPrimary, '#ffffff')
      ? '#000000'
      : '#ffffff';
  return [colors.primary, mixColors(colors.primary, away, primaryHoverShare)];
}

/**
 * The color the eye lands on, on a filled surface: the first of `candidates` that reads on
 * all of `surfaces` as it is. When none does, the highlight or the accent, whichever is
 * nearer to reading, moved only as far as it must be.
 */
function popOn(
  candidates: readonly string[],
  colors: ChosenColors,
  surfaces: readonly string[],
): string {
  const asItIs = firstThatReads(candidates, surfaces);
  if (asItIs !== undefined) return asItIs;
  const nearer =
    weakestOn(colors.accent, surfaces) > weakestOn(colors.highlight, surfaces)
      ? colors.accent
      : colors.highlight;
  return readableOn(nearer, surfaces);
}

export function derivedColors(colors: ChosenColors, base?: 'light' | 'dark'): DerivedColors {
  const surfaces = textSurfaces(colors);
  const inks = [colors.panel, colors.background, colors.text];
  const danger = readableOn(dangerRed, surfaces);
  const onPrimary = textOn(colors.primary, inks);
  // Away from the words on it: darker under light words, lighter under dark ones.
  const awayFromWords =
    contrastRatio(onPrimary, '#000000') >= contrastRatio(onPrimary, '#ffffff')
      ? '#000000'
      : '#ffffff';
  const primaryHover = mixColors(colors.primary, awayFromWords, primaryHoverShare);
  const muted = readableOn(mixColors(colors.text, colors.background, 0.35), surfaces);
  const pop =
    firstThatReads([colors.primary, colors.highlight, colors.accent], surfaces) ??
    readableOn(colors.highlight, surfaces);
  const dark = isDark(colors, base);
  const { band, bandDeep, bandGlow } = bandSurfaces(colors, base);
  const bandAll = [band, bandDeep, bandGlow];
  // Words on a band: the design's own text or surface color where one reads on all of it.
  const onBand =
    firstThatReads(dark ? [colors.text] : [onPrimary, colors.background, colors.panel], bandAll) ??
    readableOn(dark ? colors.text : onPrimary, bandAll);
  const bandPop = popOn([pop, colors.highlight, colors.accent], colors, bandAll);
  const onBandPop = textOn(bandPop, [bandDeep, band, ...inks]);
  const headerAll = headerSurfaces(colors, base);
  const headerText = dark ? colors.text : onPrimary;
  return {
    muted,
    primaryText: readableOn(colors.primary, surfaces),
    accentText: readableOn(colors.accent, surfaces),
    onPrimary,
    onHighlight: textOn(colors.highlight, inks),
    danger,
    onDanger: textOn(danger, inks),
    primaryHover,
    pop,
    onPop: textOn(pop, inks),
    band,
    bandDeep,
    bandGlow,
    onBand,
    bandMuted: readableOn(mixColors(onBand, band, 0.3), bandAll),
    bandPop,
    onBandPop,
    // Toward the words' opposite, so the words on the button read at least as well.
    bandPopHover: mixColors(
      bandPop,
      contrastRatio(onBandPop, '#000000') >= contrastRatio(onBandPop, '#ffffff')
        ? '#000000'
        : '#ffffff',
      0.4,
    ),
    headerMuted: readableOn(
      mixColors(headerText, headerAll[0] ?? colors.background, 0.3),
      headerAll,
    ),
    headerPop: popOn([pop, colors.highlight, colors.accent], colors, headerAll),
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
  const derived = derivedColors(colors, design.base);
  const onBand: [string, string][] = [
    ['band', derived.band],
    ['deep band', derived.bandDeep],
    ['band glow', derived.bandGlow],
  ];
  const still: [string, string][] = [
    ['background', colors.background],
    ['panel', colors.panel],
  ];
  const hovered: [string, string][] = still.map(([where, surface]) => [
    `hovered ${where}`,
    hoveredSurface(surface, colors.primary),
  ]);
  const everywhere = [...still, ...hovered];
  const inHeader: [string, string][] = headerSurfaces(colors, design.base).map((surface, at) => [
    at === 0 ? 'header' : 'hovered header',
    surface,
  ]);
  const checks: [string, string, [string, string][]][] = [
    ['quiet text', derived.muted, everywhere],
    ['main color as text', derived.primaryText, everywhere],
    ['accent as text', derived.accentText, everywhere],
    ['error text', derived.danger, everywhere],
    ['text', colors.text, hovered],
    ['eye-catching color', derived.pop, everywhere],
    ['text on a band', derived.onBand, onBand],
    ['quiet text on a band', derived.bandMuted, onBand],
    ['eye-catching color on a band', derived.bandPop, onBand],
    ['words on the button that matters', derived.onBandPop, [['its fill', derived.bandPop]]],
    [
      'words on the button that matters',
      derived.onBandPop,
      [['its hovered fill', derived.bandPopHover]],
    ],
    ['quiet text', derived.headerMuted, inHeader],
    ['eye-catching color', derived.headerPop, inHeader],
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
