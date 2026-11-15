// The starting designs, stored as data (T5 §1, P5 §2, C-2, C-16). Neutral names: no league
// is named in code. The first is the one a new league opens with.
import { type DesignDocument, designDocumentSchema } from './design-document.ts';

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

export const startingDesignKeys = Object.keys(definitions) as StartingDesignKey[];

export function startingDesign(key: StartingDesignKey): DesignDocument {
  return designDocumentSchema.parse(structuredClone(definitions[key]));
}
