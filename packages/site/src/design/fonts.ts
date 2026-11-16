// The fixed list of fonts we host ourselves (T5 §1, T-262). A design stores a key, never a
// web address. Every face here is served from our own address: its files come into the
// product inside an open-licence package the web app depends on, and the web app links
// them once (apps/web/src/app/font-faces.css; record 059). A page asks only for the faces
// it draws, and shows the next face of a list until its own has arrived, so a list still
// ends in faces a phone or a laptop already has that keep the same character.
//
// Each face is the variable cut of its family (one file holds every weight), which the
// packages name with "Variable" after the family's own name.
//
// The list of keys itself is the design's written shape's (packages/contracts,
// site-design.ts), so a stored design can name only a face listed here: every key of it
// must have a family below, and nothing else may.
import { designFontKeys, type DesignFontKey } from '@srleagues/contracts';

export type FontKey = DesignFontKey;

export const fontFamilies = {
  gelasio: 'Gelasio Variable',
  cinzel: 'Cinzel Variable',
  jost: 'Jost Variable',
  inter: 'Inter Variable',
  'playfair-display': 'Playfair Display Variable',
  'source-sans': 'Source Sans 3 Variable',
  oswald: 'Oswald Variable',
  'noto-naskh-arabic': 'Noto Naskh Arabic Variable',
} as const satisfies Record<FontKey, string>;

/** What a reader sees until the face has arrived, and where it has no letter for a script. */
const fallbacks = {
  // Gelasio is drawn to the widths of Georgia, so nothing moves when it takes over.
  gelasio: "Georgia, 'Times New Roman', serif",
  cinzel: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  jost: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  inter: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'playfair-display': 'Georgia, serif',
  'source-sans': "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  oswald: "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif",
  'noto-naskh-arabic': "'Noto Sans Arabic', serif",
} as const satisfies Record<FontKey, string>;

export const fontKeys: readonly [FontKey, ...FontKey[]] = designFontKeys;

export const fontStacks = Object.fromEntries(
  fontKeys.map((key) => [key, `'${fontFamilies[key]}', ${fallbacks[key]}`]),
) as Readonly<Record<FontKey, string>>;

/**
 * How a face is set when it is a design's heading face: how heavy its titles and its very
 * large display lines are, how far its letters stand apart, and whether a hero title and
 * the league's name in the header are written in capitals. These belong to the face, not
 * to a league: a classical serif is set light and close, an inscriptional face wide.
 * Every value is fixed text; nothing a league types is in it.
 */
export type HeadingTraits = {
  /** Section and card titles. */
  readonly weight: string;
  /** The hero title and the big numbers. */
  readonly displayWeight: string;
  readonly tracking: string;
  /** Whether titles are written in capitals: only a face that is drawn for them. */
  readonly titleCase: 'uppercase' | 'none';
  readonly heroCase: 'uppercase' | 'none';
  readonly heroTracking: string;
  /** The league's name in the header. */
  readonly brandCase: 'uppercase' | 'none';
  readonly brandTracking: string;
  /**
   * How wide a letter of a team's name is in this face, set as a title, as a share of its
   * size: what a scoreboard reckons with to know whether two names fit side by side.
   * Measured in a browser from the files we serve, on made-up team names, and rounded up.
   */
  readonly letterWidth: string;
};

// A distance of nothing is still written as a length, so a stylesheet can do sums with it.
const plain: HeadingTraits = {
  weight: '700',
  displayWeight: '700',
  tracking: '0em',
  titleCase: 'none',
  heroCase: 'none',
  heroTracking: '0em',
  brandCase: 'none',
  brandTracking: '0em',
  letterWidth: '0.56',
};

export const headingTraits: Readonly<Record<FontKey, HeadingTraits>> = {
  gelasio: {
    weight: '500',
    displayWeight: '400',
    tracking: '0.01em',
    titleCase: 'none',
    heroCase: 'uppercase',
    heroTracking: '0.025em',
    brandCase: 'uppercase',
    brandTracking: '0.13em',
    letterWidth: '0.56',
  },
  cinzel: {
    weight: '700',
    displayWeight: '700',
    tracking: '0.06em',
    titleCase: 'uppercase',
    heroCase: 'uppercase',
    heroTracking: '0.06em',
    brandCase: 'uppercase',
    brandTracking: '0.08em',
    letterWidth: '0.8',
  },
  'playfair-display': { ...plain, weight: '600', displayWeight: '500', tracking: '0.01em' },
  oswald: { ...plain, weight: '600', displayWeight: '600', tracking: '0.02em', letterWidth: '0.5' },
  jost: { ...plain, weight: '600', displayWeight: '600' },
  inter: { ...plain, letterWidth: '0.6' },
  'source-sans': { ...plain, letterWidth: '0.53' },
  'noto-naskh-arabic': plain,
};

/**
 * The faces whose figures can be set lining and even-width (they carry both features, or
 * are drawn that way): the only faces a score is set in, because two scores side by side
 * are compared digit by digit (docs/build/DESIGN.md, section 4, line 6). Measured in a
 * browser from the files we serve. A design whose heading face is not one of these has its
 * scores in its body face, or in the plainest face of the list when that is not one either.
 */
export const evenFigureFonts: readonly FontKey[] = ['gelasio', 'source-sans', 'inter', 'jost'];

/** The face a design's scores are set in. */
export function scoreFont(fonts: { readonly heading: FontKey; readonly body: FontKey }): FontKey {
  if (evenFigureFonts.includes(fonts.heading)) return fonts.heading;
  return evenFigureFonts.includes(fonts.body) ? fonts.body : 'source-sans';
}
