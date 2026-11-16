// MADE-UP DESIGNS, FOR PICTURES AND TESTS ONLY.
//
// Every shared piece takes its colors from a league's design, and that is proved, not
// assumed (docs/build/DESIGN.md, section 4, line 28): the pages are pictured in three
// color sets, one of them neither of the first starting design's two, and in a fourth
// whose main color is bright. Those two live here, as designs a made-up league's admin
// might have saved: a green league and an orange one. Neither is a starting design, and
// neither is ever offered to a real league.
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
  // A fourth set (step 2.147 part 3): a light league whose main color is a bright orange.
  // An orange cannot be read as text on a white page, nor white words on it: so this is
  // the set where the color the eye lands on falls back to the highlight (a burnt orange),
  // the header's bar carries dark words, and a band is made from the text color. A navy
  // for small labels.
  ember: {
    version: 1,
    base: 'light',
    colors: {
      background: '#fffaf3',
      panel: '#ffffff',
      text: '#1f2430',
      primary: '#f08a00',
      accent: '#1f3a5f',
      highlight: '#b4380f',
    },
    fonts: { heading: 'source-sans', body: 'inter' },
    corners: 'soft',
    cards: 'raised',
    spacing: 'comfortable',
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
