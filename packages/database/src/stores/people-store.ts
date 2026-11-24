// The people module's store (core's PeopleStore), bound to one league scope.
import type { PeopleStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findLeagueAudience,
  findLeagueToday,
  findPerson,
  findPersonIsMinor,
  hasRecordedChild,
  insertPerson,
  isPersonOnRoster,
  listPeople,
  lockLeagueRow,
  deleteSettingValue,
  listSettingValues,
  setPersonBinned,
  updatePerson,
} from '../queries/index.ts';

export function peopleStore(scope: LeagueScope): PeopleStore {
  return {
    find: (personId, sensitive) => findPerson(scope, personId, sensitive),
    list: (search) => listPeople(scope, search),
    create: (person) => insertPerson(scope, person),
    update: (personId, change, version) => updatePerson(scope, personId, change, version),
    setBinned: (personId, binned) => setPersonBinned(scope, personId, binned),
    isOnRoster: (personId) => isPersonOnRoster(scope, personId),
    leagueAudience: () => findLeagueAudience(scope),
    // R-28 in SQL: the answer, never the birth date (find-person-is-minor.ts).
    // A person not in this league counts as a child; "not known" stays not known.
    isMinor: async (personId) => {
      const found = await findPersonIsMinor(scope, personId);
      return found === undefined ? true : found.isMinor;
    },
    // The league's own value only: the name settings are set for the whole league.
    leagueToday: async () => {
      const today = await findLeagueToday(scope);
      if (today === undefined) throw new Error('people store: the league is not there.');
      return today;
    },
    leagueSettingRows: async (key) =>
      (await listSettingValues(scope, key, {})).filter((row) => row.level === 'league'),
    // S-109: the same reading and clearing as the leagues store's (one writer, record 065).
    hasRecordedChild: () => hasRecordedChild(scope),
    // T-403: a save that could not hold its league's row must not go on unguarded.
    lockLeague: async () => {
      if ((await lockLeagueRow(scope)) === undefined) {
        throw new Error('lockLeague: the league row could not be held.');
      }
    },
    clearLeagueSetting: (key, version) =>
      deleteSettingValue(scope, { level: 'league' }, key, version),
  };
}
