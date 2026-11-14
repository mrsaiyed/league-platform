// The leagues module (T2 §3). Other modules and packages use only what is here.
export { createLeague, type CreateLeagueError } from './commands/create-league.ts';
export { createDivision, type CreateDivisionError } from './commands/create-division.ts';
export { listDivisions } from './commands/list-divisions.ts';
export { removeDivision, type RemoveDivisionError } from './commands/remove-division.ts';
export { reorderDivisions, type ReorderDivisionsError } from './commands/reorder-divisions.ts';
export { restoreDivision, type RestoreDivisionError } from './commands/restore-division.ts';
export { updateDivision, type UpdateDivisionError } from './commands/update-division.ts';
export { createSeason, type CreateSeasonError } from './commands/create-season.ts';
export { getSeason, type GetSeasonError } from './commands/get-season.ts';
export { updateSeason, type UpdateSeasonError } from './commands/update-season.ts';
export {
  previewSeasonRules,
  type PreviewSeasonRulesError,
} from './commands/preview-season-rules.ts';
export { setSeasonRules, type SetSeasonRulesError } from './commands/set-season-rules.ts';
export {
  setSeasonRosterSettings,
  type SetSeasonRosterSettingsError,
} from './commands/set-season-roster-settings.ts';
export { readSeasonRules, type SeasonView } from './commands/season-view.ts';
export { renameShortName, type RenameShortNameError } from './commands/rename-short-name.ts';
export { setCurrentSeason, type SetCurrentSeasonError } from './commands/set-current-season.ts';
export {
  setLeagueName,
  type ChangedSinceRead,
  type LeagueName,
} from './commands/set-league-name.ts';
export { setLeagueStatus, type SetLeagueStatusError } from './commands/set-league-status.ts';
export {
  setSetting,
  setSettingFor,
  type SetSettingError,
  type SettingSaved,
} from './commands/set-setting.ts';
export { clearSetting, clearSettingFor, type ClearSettingError } from './commands/clear-setting.ts';
export {
  declaredSettings,
  membersStartPage,
  startPageChoices,
  whoMayScore,
  whoMayScoreChoices,
  startingStatsLevel,
  statsLevelChoices,
  teamsMayChooseStatsLevel,
} from './settings/declarations.ts';
export {
  defineSetting,
  hasLimits,
  settingLevels,
  settingRegistry,
  SettingDeclarationError,
  type Setting,
  type SettingDeclaration,
  type SettingLevel,
  type SettingRegistry,
} from './settings/define-setting.ts';
export { getSetting } from './settings/get-setting.ts';
export { lookupSetting, type SettingValue, type StoredSetting } from './settings/lookup-setting.ts';
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
export { leagueTransitions, readOnlyStatuses, type Transition } from './league-states.ts';
export {
  audiences,
  leagueStatuses,
  seasonStatuses,
  type Audience,
  type LeagueStatus,
  type SeasonStatus,
} from './league-values.ts';
export type {
  DivisionChange,
  DivisionRecord,
  DivisionsStore,
  LeagueRecord,
  LeaguesStore,
  LeaguesTx,
  NewDivision,
  NewLeague,
  NewSeason,
  SeasonChange,
  SeasonRecord,
  SettingPlace,
  StoredSettingRow,
} from './ports.ts';
export {
  adminAreas,
  checkedSiteOrigin,
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
export {
  adminAreaPermissions,
  holdsAnywhere,
  mayOpenTracker,
  openAdminAreas,
} from './rules/admin-area-access.ts';
export { platformPages, platformUrl, type PlatformPage } from './rules/platform-url.ts';
export {
  hiddenLeagueStatuses,
  isLeagueHidden,
  mayOpenLeague,
  maySeeDraftLeague,
  maySeeSuspendedLeague,
} from './rules/league-visibility.ts';
export { isBlockedShortName, isShortNameFormat, isSystemShortName } from './short-names.ts';
export {
  binCutoff,
  binKeepDays,
  binKinds,
  removedForGoodAt,
  type BinCounts,
  type BinKind,
  type BinListing,
  type BinnedItem,
  type BinStore,
  type BinTx,
  type GameInBin,
  type PersonInBin,
  type TeamInBin,
} from './bin.ts';
export { binEmptyJob, emptyBin } from './empty-bin.ts';
export { listBin, type BinList } from './commands/list-bin.ts';
export { restoreGame, type RestoreGameError } from './commands/restore-game.ts';
export { restorePerson, type RestorePersonError } from './commands/restore-person.ts';
export { restoreTeam, type RestoreTeamError } from './commands/restore-team.ts';
