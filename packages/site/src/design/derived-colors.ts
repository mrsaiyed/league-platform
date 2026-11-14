// Colors worked out from the six a league chooses, so its own colors drop into a finished
// layout (docs/build/DESIGN.md, section 3). Each is a plain #rrggbb value, so the contrast
// of the text that uses it can be measured on the page.
import { contrastRatio, nearestReadableColor } from './contrast.ts';

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

/** `color`, moved only as far as it must be to read as text on every one of `surfaces`. */
export function readableOn(color: string, surfaces: readonly string[]): string {
  let shade = color;
  for (let round = 0; round < 3; round++) {
    const hardest = surfaces.reduce((worst, surface) =>
      contrastRatio(shade, surface) < contrastRatio(shade, worst) ? surface : worst,
    );
    if (contrastRatio(shade, hardest) >= MINIMUM) return shade;
    shade = nearestReadableColor(shade, hardest);
  }
  return shade;
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
};

export function derivedColors(colors: {
  readonly background: string;
  readonly panel: string;
  readonly text: string;
  readonly primary: string;
  readonly accent: string;
  readonly highlight: string;
}): DerivedColors {
  const surfaces = [colors.background, colors.panel];
  const inks = [colors.panel, colors.background, colors.text];
  const danger = readableOn(dangerRed, surfaces);
  return {
    muted: readableOn(mixColors(colors.text, colors.background, 0.35), surfaces),
    primaryText: readableOn(colors.primary, surfaces),
    accentText: readableOn(colors.accent, surfaces),
    onPrimary: textOn(colors.primary, inks),
    onHighlight: textOn(colors.highlight, inks),
    danger,
    onDanger: textOn(danger, inks),
  };
}
