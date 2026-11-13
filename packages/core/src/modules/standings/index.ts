// The standings module (T2 §3): standings rows and season player totals, worked out
// from results (T3 §9). Other modules and packages use only what is here.
export { addAdjustment, type AddAdjustmentError } from './commands/add-adjustment.ts';
export { removeAdjustment, type RemoveAdjustmentError } from './commands/remove-adjustment.ts';
export { rebuildStandings, type RebuildStandingsError } from './commands/rebuild-standings.ts';
export {
  rebuildOnGameFinalized,
  rebuildOnGameReopened,
  standingsHandlers,
} from './on-game-result.ts';
export { rebuildSeason, type SeasonRebuilt } from './rebuild-season.ts';
export { previewRulesChange, type RulesChangePreview } from './preview-rules-change.ts';
export { whatWouldMove, type MovedField, type TeamMove } from './what-would-move.ts';
export type {
  NewAdjustment,
  SeasonAdjustment,
  StandingsStore,
  StandingsTx,
  TableTeam,
} from './ports.ts';
