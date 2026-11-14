// Contrast between text and background, returned as warnings on save (T5 §1, C-1, P5 §2).
import type { DesignDocument } from './design-document.ts';

const hexPattern = /^#[0-9a-fA-F]{6}$/;

function channels(hex: string): [number, number, number] {
  if (!hexPattern.test(hex)) throw new Error(`Not a #rrggbb color: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const MINIMUM = 4.5;

/** The text color closest to `text` (moved toward white or black) that reads on `background`. */
export function nearestReadableColor(text: string, background: string): string {
  const target: [number, number, number] =
    luminance(background) < 0.18 ? [255, 255, 255] : [0, 0, 0];
  const from = channels(text);
  for (let step = 0; step <= 100; step++) {
    const mixed = from.map((v, i) => Math.round(v + ((target[i] ?? 0) - v) * (step / 100)));
    const hex = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(hex, background) >= MINIMUM) return hex;
  }
  return target[0] === 255 ? '#ffffff' : '#000000';
}

export type ContrastWarning = {
  pair: string;
  ratio: number;
  minimum: number;
  suggestion: string;
};

export function contrastWarnings(design: DesignDocument): ContrastWarning[] {
  const { background, panel, text, highlight } = design.colors;
  // The highlight is written as words (the Live marker, a score), so it must read like text.
  // Left out, it is the accent, which is only ever a border, so there is nothing to check.
  const pairs: [string, string, string][] = [
    ['text on background', text, background],
    ['text on panel', text, panel],
    ...(highlight
      ? ([
          ['highlight on background', highlight, background],
          ['highlight on panel', highlight, panel],
        ] as [string, string, string][])
      : []),
  ];
  return pairs
    .map(([pair, fg, bg]) => ({
      pair,
      ratio: contrastRatio(fg, bg),
      minimum: MINIMUM,
      suggestion: nearestReadableColor(fg, bg),
    }))
    .filter((w) => w.ratio < w.minimum);
}
