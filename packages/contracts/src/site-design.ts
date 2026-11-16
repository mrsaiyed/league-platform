// A league's design (T5 §1, P5 §2): the small JSON document its pages are drawn in, and
// the starting designs, which are stored copies of such a document (C-2, C-16). The one
// written shape of it: the site package draws it (packages/site, which re-exports it
// unchanged), core checks it when a design is published, and the database keeps what
// passed (site_releases.design, migration 0020; record 073, T-277). Every value is a
// color in one strict form, a key from a fixed list or a word from a fixed list, so
// nothing stored can carry text of its own into a page's styles.
import { z } from 'zod';

/** The fonts a design may name, by key (T5 §1, T-262). packages/site serves each one. */
export const designFontKeys = [
  'gelasio',
  'cinzel',
  'jost',
  'inter',
  'playfair-display',
  'source-sans',
  'oswald',
  'noto-naskh-arabic',
] as const;
export type DesignFontKey = (typeof designFontKeys)[number];

/** A color written #rrggbb: nothing else, so no other text can follow it into a style. */
export const designColorPattern = /^#[0-9a-fA-F]{6}$/;
const hexColor = z.string().regex(designColorPattern, 'Use a color like #0b2233');
const assetRef = z.string().regex(/^asset:[A-Za-z0-9_-]+$/, 'Use an uploaded image');

export const designDocumentSchema = z.object({
  version: z.literal(1),
  base: z.enum(['light', 'dark']),
  colors: z.object({
    background: hexColor,
    panel: hexColor,
    text: hexColor,
    primary: hexColor,
    accent: hexColor,
    // Used sparingly to make a few things stand out; a design without one uses its accent (C-15).
    highlight: hexColor.optional(),
  }),
  fonts: z.object({ heading: z.enum(designFontKeys), body: z.enum(designFontKeys) }),
  corners: z.enum(['sharp', 'soft', 'round']),
  cards: z.enum(['flat', 'outlined', 'raised']),
  spacing: z.enum(['compact', 'comfortable', 'roomy']),
  logo: assetRef.optional(),
  icon: assetRef.optional(),
});

export type DesignDocument = z.infer<typeof designDocumentSchema>;

export function parseDesignDocument(
  input: unknown,
): { ok: true; design: DesignDocument } | { ok: false; problems: string[] } {
  const parsed = designDocumentSchema.safeParse(input);
  if (parsed.success) return { ok: true, design: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'design'}: ${i.message}`),
  };
}

// The starting designs, stored as data (T5 §1, P5 §2, C-2, C-16). Neutral names: no league
// is named in code. The first is the one C-16 builds from the first demo.
const definitions = {
  // The first starting design (C-16): a wine-black page, panels one step lighter, cream
  // text, a deep maroon for identity, a soft rose for small labels and gold where the eye
  // should land. A serif for titles, names and numbers; a plain sans for reading.
  crest: {
    version: 1,
    base: 'dark',
    colors: {
      background: '#170e13',
      panel: '#24171e',
      text: '#f6f1e9',
      primary: '#96062d',
      accent: '#b77d8c',
      highlight: '#d3b780',
    },
    fonts: { heading: 'gelasio', body: 'source-sans' },
    corners: 'sharp',
    cards: 'outlined',
    spacing: 'roomy',
  },
  // Its light sibling: maroon, white and gold. A warm white page, white panels with a fine
  // line around them, the same maroon for the header, the bands and the numbers, and the
  // same gold. Gold cannot be read on white, so here it is the accent: small labels are a
  // darker shade of it, worked out, and the gold itself is spent where it need not be read
  // (a short rule, a fine line, the bar under a winner's score) and on the maroon, where
  // it can. The maroon is also the highlight.
  'crest-light': {
    version: 1,
    base: 'light',
    colors: {
      background: '#fffefa',
      panel: '#ffffff',
      text: '#211c20',
      primary: '#96062d',
      accent: '#d3b780',
      highlight: '#96062d',
    },
    fonts: { heading: 'gelasio', body: 'source-sans' },
    corners: 'sharp',
    cards: 'outlined',
    spacing: 'roomy',
  },
  'midnight-gold': {
    version: 1,
    base: 'dark',
    colors: {
      background: '#0b2233',
      panel: '#0f2c40',
      text: '#f3ead2',
      primary: '#c8a84b',
      accent: '#2fa89a',
      highlight: '#ff8a65',
    },
    fonts: { heading: 'cinzel', body: 'jost' },
    corners: 'soft',
    cards: 'outlined',
    spacing: 'roomy',
  },
  // The neutral design: what a league with no design of its own is drawn in.
  'clean-court': {
    version: 1,
    base: 'light',
    colors: {
      background: '#f7f8fa',
      panel: '#ffffff',
      text: '#14202b',
      primary: '#1f5fbf',
      accent: '#e8590c',
      highlight: '#b4236b',
    },
    // Plain type and rounded panels: what the light standard is made of (docs/build/DESIGN.md,
    // section 3).
    fonts: { heading: 'source-sans', body: 'inter' },
    corners: 'round',
    cards: 'raised',
    spacing: 'comfortable',
  },
} satisfies Record<string, DesignDocument>;

export type StartingDesignKey = keyof typeof definitions;

export const startingDesignKeys = Object.keys(definitions) as [
  StartingDesignKey,
  ...StartingDesignKey[],
];

/** The design a league with no design of its own is drawn in, and a new league's by default. */
export const neutralStartingDesign: StartingDesignKey = 'clean-court';

export function isStartingDesignKey(value: unknown): value is StartingDesignKey {
  return typeof value === 'string' && Object.hasOwn(definitions, value);
}

export function startingDesign(key: StartingDesignKey): DesignDocument {
  return designDocumentSchema.parse(structuredClone(definitions[key]));
}

/** The three colors a league may choose when it starts from a design (P5 §2). */
export const startingColors = z.strictObject({
  primary: hexColor.optional(),
  accent: hexColor.optional(),
  highlight: hexColor.optional(),
});
export type StartingColors = z.infer<typeof startingColors>;

/**
 * A starting design with the main, accent and highlight colors a league chose in place
 * of its own; every other value is the starting design's. Checked again as a whole.
 */
export function startingDesignWith(key: StartingDesignKey, colors: StartingColors = {}) {
  const design = startingDesign(key);
  const chosen = startingColors.parse(colors);
  return designDocumentSchema.parse({
    ...design,
    colors: {
      ...design.colors,
      ...(chosen.primary === undefined ? {} : { primary: chosen.primary }),
      ...(chosen.accent === undefined ? {} : { accent: chosen.accent }),
      ...(chosen.highlight === undefined ? {} : { highlight: chosen.highlight }),
    },
  });
}
