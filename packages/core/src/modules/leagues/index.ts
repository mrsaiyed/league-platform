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
  setSetting,
  setSettingFor,
  type SetSettingError,
  type SettingSaved,
} from './commands/set-setting.ts';
export { clearSetting, clearSettingFor, type ClearSettingError } from './commands/clear-setting.ts';
export { declaredSettings, membersStartPage, startPageChoices } from './settings/declarations.ts';
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
export { audiences, leagueStatuses, type Audience, type LeagueStatus } from './league-values.ts';
export type {
  LeagueRecord,
  LeaguesStore,
  LeaguesTx,
  NewLeague,
  NewSeason,
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
  maySeeHiddenLeague,
} from './rules/league-visibility.ts';
export { isBlockedShortName, isShortNameFormat, isSystemShortName } from './short-names.ts';
