// Two visibly different starting designs, stored as data (T5 §1, P5 §2, C-2).
// Neutral names: no league is named in code.
import { type DesignDocument, designDocumentSchema } from './design-document.ts';

const definitions = {
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
    fonts: { heading: 'oswald', body: 'inter' },
    corners: 'sharp',
    cards: 'raised',
    spacing: 'comfortable',
  },
} satisfies Record<string, DesignDocument>;

export type StartingDesignKey = keyof typeof definitions;

export const startingDesignKeys = Object.keys(definitions) as StartingDesignKey[];

export function startingDesign(key: StartingDesignKey): DesignDocument {
  return designDocumentSchema.parse(structuredClone(definitions[key]));
}
