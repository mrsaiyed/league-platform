// The leagues module's store (core's LeaguesStore), bound to one league scope.
import type { LeagueStatus, LeaguesStore } from '@srleagues/core';
import type { JsonValue } from '../db/schema-types.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  deleteSettingValue,
  findCurrentLeague,
  findProgramId,
  findSeasonProgramId,
  insertLeague,
  insertSeason,
  listSettingValues,
  renameLeagueSlug,
  setCurrentSeason,
  updateLeagueName,
  updateLeagueStatus,
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
    isPlatformStaff: async () =>
      scope.accountId !== null && platformStaff.includes(scope.accountId),
    createLeague: (league) => insertLeague(scope, league),
    renameShortName: (slug, version, forwardMonths) =>
      renameLeagueSlug(scope, slug, version, forwardMonths),
    setStatus: (status: LeagueStatus, version) => updateLeagueStatus(scope, status, version),
    findProgram: async (programId) => {
      const id = await findProgramId(scope, programId);
      return id === undefined ? undefined : { id };
    },
    createSeason: (season) => insertSeason(scope, season),
    seasonProgramId: (seasonId) => findSeasonProgramId(scope, seasonId),
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
  };
}
