// The leagues module's store (core's LeaguesStore), bound to one league scope.
import type { LeagueStatus, LeaguesStore, SeasonStatus } from '@srleagues/core';
import type { JsonObject, JsonValue } from '../db/schema-types.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  countPrograms,
  deleteSettingValue,
  findSeason,
  findCurrentLeague,
  findLeagueAudience,
  findLeagueContactEmail,
  findLeagueProfile,
  findPublishedDesign,
  findProgramId,
  hasRecordedChild,
  hasWalkUpOfUnknownAge,
  lockLeagueRow,
  findSeasonProgramId,
  insertLeague,
  insertSeason,
  insertSiteRelease,
  listSettingValues,
  renameLeagueSlug,
  setCurrentSeason,
  copySeasonSetup,
  findCurrentSeasonId,
  updateLeagueAudience,
  updateLeagueName,
  updateLeagueProfile,
  updateLeagueStatus,
  updateSeason,
  type SeasonChangeRow,
  writeSettingValue,
} from '../queries/index.ts';

/** A value the declaration's schema accepted is plain data, so it is JSON. */
const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

export type LeaguesStoreOptions = {
  /** Our own staff, by account id, from the app's settings. Staff are not a league role (A-3, T-77). */
  platformStaff?: readonly string[];
};

export function leaguesStore(
  scope: LeagueScope,
  { platformStaff = [] }: LeaguesStoreOptions = {},
): LeaguesStore {
  return {
    currentLeague: () => findCurrentLeague(scope),
    setName: (name, version) => updateLeagueName(scope, name, version),
    leagueAudience: () => findLeagueAudience(scope),
    hasRecordedChild: () => hasRecordedChild(scope),
    hasWalkUpOfUnknownAge: () => hasWalkUpOfUnknownAge(scope),
    // T-403: a save that could not hold its league's row must not go on unguarded.
    lockLeague: async () => {
      if ((await lockLeagueRow(scope)) === undefined) {
        throw new Error('lockLeague: the league row could not be held.');
      }
    },
    leagueContactEmail: () => findLeagueContactEmail(scope),
    isPlatformStaff: async () =>
      scope.accountId !== null && platformStaff.includes(scope.accountId),
    createLeague: (league) => insertLeague(scope, league),
    renameShortName: (slug, version, forwardMonths) =>
      renameLeagueSlug(scope, slug, version, forwardMonths),
    setStatus: (status: LeagueStatus, version) => updateLeagueStatus(scope, status, version),
    leagueProfile: () => findLeagueProfile(scope),
    setProfile: (profile, version) => updateLeagueProfile(scope, profile, version),
    setAudience: (audience, version, unlist) =>
      updateLeagueAudience(scope, audience, version, unlist),
    findProgram: async (programId) => {
      const id = await findProgramId(scope, programId);
      return id === undefined ? undefined : { id };
    },
    createSeason: ({ rules, ...season }) =>
      insertSeason(
        scope,
        rules === undefined ? season : { ...season, rules: toJson(rules) as JsonObject },
      ),
    findSeason: async (seasonId) => {
      const season = await findSeason(scope, seasonId);
      return season === undefined
        ? undefined
        : { ...season, status: season.status as SeasonStatus };
    },
    programCount: () => countPrograms(scope),
    updateSeason: (seasonId, change, version) => {
      // The rules are a typed document in core and plain JSON in the database.
      const { rules, ...others } = change;
      const row: SeasonChangeRow =
        rules === undefined ? others : { ...others, rules: toJson(rules) as JsonObject };
      return updateSeason(scope, seasonId, row, version);
    },
    seasonProgramId: (seasonId) => findSeasonProgramId(scope, seasonId),
    currentSeasonOf: (programId) => findCurrentSeasonId(scope, programId),
    copySeasonSetup: (copy) => copySeasonSetup(scope, copy),
    setCurrentSeason: (seasonId) => setCurrentSeason(scope, seasonId),
    settingRows: (key, places) => listSettingValues(scope, key, places),
    writeSetting: (place, key, document, version) =>
      writeSettingValue(
        scope,
        place,
        key,
        { version: document.version, value: toJson(document.value) },
        version,
      ),
    clearSetting: (place, key, version) => deleteSettingValue(scope, place, key, version),
    latestSiteReleaseNumber: async () => (await findPublishedDesign(scope))?.number ?? 0,
    publishSiteRelease: (release) =>
      insertSiteRelease(scope, {
        number: release.number,
        startingDesign: release.startingDesign,
        // A design is a checked typed document in core and plain JSON in the database.
        design: toJson(release.design) as JsonObject,
        publishedByAccountId: release.publishedByAccountId,
      }),
  };
}
