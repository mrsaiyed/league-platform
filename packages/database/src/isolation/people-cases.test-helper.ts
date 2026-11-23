// The two-league harness's cases for people (step 2.17, T-65): every query in
// ../queries for them and every command of the same step. Imported by
// isolation-cases.test-helper.ts, which registers the rest.
import {
  createPerson,
  getPerson,
  listPeople as listPeopleCommand,
  removePerson,
  setNameRequest,
  updatePerson as updatePersonCommand,
} from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  findLeagueAudience,
  findLeagueContactEmail,
  findPerson,
  findPersonIsMinor,
  hasRecordedChild,
  insertPerson,
  isPersonOnRoster,
  listPeople,
  setPersonBinned,
  updatePerson,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { moveOwnLeagueRowLast, setTargetLeagueApart } from './public-schedule-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: findPerson,
  name: "find the target's person, with the sensitive fields",
  run: (scope, target) => findPerson(scope, target.personId, true),
});

registerIsolationCase({
  subject: findPersonIsMinor,
  name: "ask whether the target's person is a child",
  run: (scope, target) => findPersonIsMinor(scope, target.personId),
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
  subject: findLeagueAudience,
  name: "read who plays in the scope's league",
  arrange: setTargetLeagueApart,
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    return findLeagueAudience(scope);
  },
});

registerIsolationCase({
  subject: findLeagueContactEmail,
  name: "read how people reach the scope's league, its row moved after the target's",
  // Step 2.224, part 3: each league has its own contact address (the seed's), so a read
  // that lost its `where id = scope.leagueId` meets the target's row first and names it.
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    return findLeagueContactEmail(scope);
  },
});

/**
 * Step 2.224, part 3: in another league's runs the scope's own people are first marked
 * adults with no birth date (in the run's rolled-back transaction, where the fence lets
 * it), so the target's child (the seed's) is the only one anywhere and only the query's
 * league filter keeps the answer "no". In the target's own runs nothing is changed.
 */
async function noChildInOwnLeague(scope: LeagueScope, target: LeagueRecords) {
  if (scope.leagueId === target.leagueId) return;
  const trx = transactionOf(scope);
  await sql`savepoint no_child_here`.execute(trx);
  try {
    await trx
      .updateTable('people')
      .set({ is_minor: false, birth_date: null })
      .where('league_id', '=', scope.leagueId)
      .execute();
    await sql`release savepoint no_child_here`.execute(trx);
  } catch {
    await sql`rollback to savepoint no_child_here`.execute(trx);
  }
}

registerIsolationCase({
  subject: hasRecordedChild,
  name: "ask whether anyone in the scope's league is recorded as a child, none of its own",
  run: async (scope, target) => {
    await noChildInOwnLeague(scope, target);
    return hasRecordedChild(scope);
  },
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

registerCommandCase(getPerson, harnessTx, {
  name: "read the target's person, with the sensitive fields",
  input: (target) => ({ personId: target.personId }),
});

registerCommandCase(updatePersonCommand, harnessTx, {
  name: "rename the target's person",
  input: (target) => ({ personId: target.personId, version: 1, firstName: 'Harness' }),
});

registerCommandCase(setNameRequest, harnessTx, {
  name: "take the target's person's name off public pages",
  input: (target) => ({
    personId: target.personId,
    version: 1,
    showAs: 'removed',
    reason: 'personAsked',
  }),
});

// Initials read the person's age, the league's audience and its name settings (R-25).
registerCommandCase(setNameRequest, harnessTx, {
  name: "show the target's person as initials",
  input: (target) => ({
    personId: target.personId,
    version: 1,
    showAs: 'initials',
    reason: 'guardianAsked',
  }),
});

registerCommandCase(removePerson, harnessTx, {
  name: "move the target's former player to the bin",
  input: (target) => ({ personId: target.formerPlayerId }),
});

registerCommandCase(listPeopleCommand, harnessTx, {
  name: "list the scope's people",
  input: () => ({}),
});
