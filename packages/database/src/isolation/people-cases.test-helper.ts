// The two-league harness's cases for people (step 2.17, T-65): every query in
// ../queries for them and every command of the same step. Imported by
// isolation-cases.test-helper.ts, which registers the rest.
import {
  createPerson,
  listPeople as listPeopleCommand,
  removePerson,
  updatePerson as updatePersonCommand,
} from '@srleagues/core';
import {
  findPerson,
  insertPerson,
  isPersonOnRoster,
  listPeople,
  setPersonBinned,
  updatePerson,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: findPerson,
  name: "find the target's person, with the sensitive fields",
  run: (scope, target) => findPerson(scope, target.personId, true),
});

registerIsolationCase({
  subject: listPeople,
  name: "list the scope's people, with the sensitive fields",
  run: (scope) => listPeople(scope, { limit: 50, offset: 0, sensitive: true }),
});

registerIsolationCase({
  subject: insertPerson,
  name: "add a person to the scope's league",
  run: (scope) =>
    insertPerson(scope, {
      firstName: 'Harness',
      lastName: 'Person',
      publicName: null,
      contactEmail: null,
      birthDate: null,
      isMinor: null,
    }),
});

registerIsolationCase({
  subject: updatePerson,
  name: "rename the target's person",
  run: (scope, target) => updatePerson(scope, target.personId, { firstName: 'Harness' }, 1),
});

registerIsolationCase({
  subject: setPersonBinned,
  name: "move the target's former player to the bin",
  run: (scope, target) => setPersonBinned(scope, target.formerPlayerId, true),
});

registerIsolationCase({
  subject: isPersonOnRoster,
  name: "ask whether the target's person is on a roster",
  run: (scope, target) => isPersonOnRoster(scope, target.personId),
});

// Commands ----------------------------------------------------------------------------

registerCommandCase(createPerson, harnessTx, {
  name: 'add a person',
  input: () => ({ firstName: 'Harness', lastName: 'Person', contactEmail: 'h@example.test' }),
});

registerCommandCase(updatePersonCommand, harnessTx, {
  name: "rename the target's person",
  input: (target) => ({ personId: target.personId, version: 1, firstName: 'Harness' }),
});

registerCommandCase(removePerson, harnessTx, {
  name: "move the target's former player to the bin",
  input: (target) => ({ personId: target.formerPlayerId }),
});

registerCommandCase(listPeopleCommand, harnessTx, {
  name: "list the scope's people",
  input: () => ({}),
});
