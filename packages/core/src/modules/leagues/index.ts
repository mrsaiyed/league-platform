// The leagues module (T2 §3). Other modules and packages use only what is here.
export {
  createLeague,
  type CreatedLeague,
  type CreateLeagueError,
} from './commands/create-league.ts';
export {
  removeDraftLeague,
  type RemovedDraftLeague,
  type RemoveDraftLeagueError,
} from './commands/remove-draft-league.ts';
export { namedTimeZone } from './time-zone.ts';
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
  publishSiteDesign,
  type PublishedSiteDesign,
  type PublishSiteDesignError,
} from './commands/publish-site-design.ts';
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
  scorekeeperReopenMinutes,
  startingStatsLevel,
  statsLevelChoices,
  teamsMayChooseStatsLevel,
  minimumGamesToRank,
  publicNames,
  publicNamesChoices,
  childrenInFullConfirmed,
  playersMayAskForInitials,
} from './settings/declarations.ts';
export {
  defineSetting,
  hasLimits,
  needsConfirming,
  settingLevels,
  settingRegistry,
  SettingDeclarationError,
  type Setting,
  type SettingDeclaration,
  type SettingLevel,
  type SettingRegistry,
} from './settings/define-setting.ts';
export { getSetting } from './settings/get-setting.ts';
export {
  describeSetting,
  kindOf,
  type SettingField,
  type SettingKind,
} from './settings/describe-setting.ts';
export { listLeagueSettings, type LeagueSettingRow } from './settings/list-league-settings.ts';
export { readPrivacyFacts, type PrivacyFacts } from './settings/read-privacy-facts.ts';
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
  offeredSports,
  seasonStatuses,
  type Audience,
  type LeagueStatus,
  type OfferedSport,
  type SeasonStatus,
} from './league-values.ts';
export {
  dayIn,
  newLeagueFields,
  planNewLeague,
  seasonPartOf,
  seasonParts,
  seasonSlugOf,
  suggestedSeason,
  whoPlaysChoices,
  type NewLeagueAnswers,
  type NewLeagueField,
  type NewLeaguePlan,
  type NewLeaguePlanResult,
  type NewLeagueProblem,
  type SeasonPart,
  type SeasonSuggestion,
  type WhoPlays,
} from './rules/new-league-plan.ts';
export type {
  DivisionChange,
  DivisionRecord,
  DivisionsStore,
  DraftLeagueRemoval,
  DraftLeagueRemovalAsked,
  LeagueRecord,
  LeagueRemovalFinding,
  LeagueRemovalStore,
  LeagueRemovalTx,
  LeaguesStore,
  LeaguesTx,
  NewDivision,
  NewLeague,
  NewSeason,
  NewSiteRelease,
  SeasonChange,
  SeasonRecord,
  SettingPlace,
  StoredSettingRow,
} from './ports.ts';
export {
  adminAreas,
  checkedSiteOrigin,
  forwardedLeagueUrl,
  gameAnchor,
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
export {
  myLeagues,
  type AccountLeagueRow,
  type LeagueMembership,
  type MyLeague,
  type MyLeaguesReader,
} from './queries/my-leagues.ts';
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
