// The people module's store (core's PeopleStore), bound to one league scope.
import type { PeopleStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findLeagueAudience,
  findPerson,
  findPersonIsMinor,
  insertPerson,
  isPersonOnRoster,
  listPeople,
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
    leagueSettingRows: async (key) =>
      (await listSettingValues(scope, key, {})).filter((row) => row.level === 'league'),
  };
}
