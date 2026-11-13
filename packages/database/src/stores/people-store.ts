// The people module's store (core's PeopleStore), bound to one league scope.
import type { PeopleStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findPerson,
  insertPerson,
  isPersonOnRoster,
  listPeople,
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
  };
}
