// One game's own format (step 2.119): the panel and form the tracker's start
// confirmation and the admin's games area share, its words and its client.
export { checkBeforeStart, sameData, type StartCheck } from './check-before-start.ts';
export {
  createGameFormatClient,
  type FormatOutcome,
  type GameFormatClient,
} from './format-client.ts';
export { formatOfValues, valuesOf, type FormatValues } from './format-values.ts';
export { factLine, factLines, formatWords, refusalText, summaryOf } from './format-words.ts';
export {
  GameFormatForm,
  GameFormatPanel,
  type FormatPanelLook,
  type StartConfirm,
} from './game-format-panel.tsx';
