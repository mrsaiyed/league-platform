// The leagues module (T2 §3). Other modules and packages use only what is here.
export { createLeague, type CreateLeagueError } from './commands/create-league.ts';
export { createSeason, type CreateSeasonError } from './commands/create-season.ts';
export { renameShortName, type RenameShortNameError } from './commands/rename-short-name.ts';
export { setCurrentSeason, type SetCurrentSeasonError } from './commands/set-current-season.ts';
export {
  setLeagueName,
  type ChangedSinceRead,
  type LeagueName,
} from './commands/set-league-name.ts';
export { setLeagueStatus, type SetLeagueStatusError } from './commands/set-league-status.ts';
export {
  leagueCreated,
  leagueNameChanged,
  leagueShortNameChanged,
  leagueStatusChanged,
  type LeagueCreated,
  type LeagueNameChanged,
  type LeagueShortNameChanged,
  type LeagueStatusChanged,
} from './events.ts';
export { leagueTransitions, type Transition } from './league-states.ts';
export { audiences, leagueStatuses, type Audience, type LeagueStatus } from './league-values.ts';
export type { LeagueRecord, LeaguesStore, LeaguesTx, NewLeague, NewSeason } from './ports.ts';
export {
  adminAreas,
  forwardedLeagueUrl,
  isLeagueIdFormat,
  isLeagueSiteName,
  leagueApiBase,
  leagueApiUrl,
  leagueUrl,
  type AdminArea,
  type LeagueAddressee,
  type LeaguePage,
  type LeagueUrlOptions,
} from './rules/league-url.ts';
export { isBlockedShortName, isShortNameFormat, isSystemShortName } from './short-names.ts';
