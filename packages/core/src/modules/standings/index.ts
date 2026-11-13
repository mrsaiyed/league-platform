// The standings module (T2 §3): standings rows and season player totals, worked out
// from results (T3 §9). Other modules and packages use only what is here.
export { rebuildStandings, type RebuildStandingsError } from './commands/rebuild-standings.ts';
export {
  rebuildOnGameFinalized,
  rebuildOnGameReopened,
  standingsHandlers,
} from './on-game-result.ts';
export { rebuildSeason, type SeasonRebuilt } from './rebuild-season.ts';
export type { SeasonAdjustment, StandingsStore, StandingsTx, TableTeam } from './ports.ts';
