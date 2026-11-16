// The starting designs, stored as data (T5 §1, P5 §2, C-2, C-16). Neutral names: no league
// is named in code. They live beside the design's written shape in packages/contracts
// (site-design.ts), so a league made by our tools starts from the very same documents
// (record 073, T-277); this package re-exports them unchanged.
export {
  isStartingDesignKey,
  neutralStartingDesign,
  startingDesign,
  startingDesignKeys,
  startingDesignWith,
  type StartingDesignKey,
} from '@srleagues/contracts';
