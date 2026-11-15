// MADE-UP DESIGNS, FOR PICTURES AND TESTS ONLY.
//
// Every shared piece takes its colors from a league's design, and that is proved, not
// assumed (docs/build/DESIGN.md, section 4, line 28): the pages are pictured in three
// color sets, one of them neither of the first starting design's two. That third set
// lives here, as the design a made-up league's admin might have saved: a green league. It
// is not a starting design and is never offered to a real league.
import {
  designDocumentSchema,
  startingDesign,
  startingDesignKeys,
  type DesignDocument,
  type StartingDesignKey,
} from '@srleagues/site';

const madeUpDesigns = {
  // A deep pine page, an emerald for identity, sea-green for small labels and a lime
  // where the eye should land.
  pine: {
    version: 1,
    base: 'dark',
    colors: {
      background: '#0c1b18',
      panel: '#132a25',
      text: '#eef4ee',
      primary: '#1e7f5c',
      accent: '#7cc7b3',
      highlight: '#cdea5f',
    },
    fonts: { heading: 'gelasio', body: 'source-sans' },
    corners: 'sharp',
    cards: 'outlined',
    spacing: 'roomy',
  },
} satisfies Record<string, DesignDocument>;

export type MadeUpDesignKey = keyof typeof madeUpDesigns;

/** A design the first made-up league can be pictured under (LOCAL_DESIGN). */
export type PicturedDesignKey = StartingDesignKey | MadeUpDesignKey;

export const madeUpDesignKeys = Object.keys(madeUpDesigns) as MadeUpDesignKey[];

export const picturedDesignKeys = [...startingDesignKeys, ...madeUpDesignKeys] as [
  PicturedDesignKey,
  ...PicturedDesignKey[],
];

export function madeUpDesign(key: MadeUpDesignKey): DesignDocument {
  return designDocumentSchema.parse(structuredClone(madeUpDesigns[key]));
}

/** The design a name stands for: a starting design, or one of the made-up ones above. */
export function picturedDesign(key: PicturedDesignKey): DesignDocument {
  return Object.hasOwn(madeUpDesigns, key)
    ? madeUpDesign(key as MadeUpDesignKey)
    : startingDesign(key as StartingDesignKey);
}
