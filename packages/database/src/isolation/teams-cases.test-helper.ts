// The two-league harness's cases for teams (step 2.18, T-65): every query in ../queries
// for them and every command of the same step. Imported by isolation-cases.test-helper.ts.
import {
  addToRoster,
  changeRosterEntry,
  createTeam,
  listRoster as listRosterCommand,
  markLeft,
  removeTeam,
  reorderRoster,
  setTeamStatsVisibility,
  updateTeam as updateTeamCommand,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  findRosterEntry,
  findTeam,
  insertRosterEntry,
  insertTeam,
  listRoster,
  setTeamBinned,
  updateRosterEntry,
  updateTeam,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

// A case that writes needs a season of the scope's own league: a refusal naming the
// target's ids would be a leak. With none in sight (the run whose fence is set to
// another league) it uses an id that is nowhere.
async function ownSeasonId(scope: LeagueScope) {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .limit(1)
    .executeTakeFirst();
  return row?.id ?? randomUUID();
}

// A roster write needs a team and a person of the scope's own league (a refusal naming
// the target's ids would be a leak); with none in sight it uses ids that are nowhere.
async function ownTeamAndPerson(scope: LeagueScope) {
  const trx = transactionOf(scope);
  const team = await trx
    .selectFrom('teams')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .limit(1)
    .executeTakeFirst();
  const person = await trx
    .insertInto('people')
    .values({ league_id: scope.leagueId, first_name: 'Harness', last_name: 'Player' })
    .returning('id')
    .executeTakeFirst();
  return { teamId: team?.id ?? randomUUID(), personId: person?.id ?? randomUUID() };
}

registerIsolationCase({
  subject: findTeam,
  name: "find the target's team",
  run: (scope, target) => findTeam(scope, target.teamId),
});

registerIsolationCase({
  subject: insertTeam,
  name: "add a team to a season of the scope's league",
  run: async (scope) =>
    insertTeam(scope, {
      seasonId: await ownSeasonId(scope),
      divisionId: null,
      slug: 'harness-team',
      name: 'Harness team',
      color: null,
      statsVisibility: 'everyone',
    }),
});

registerIsolationCase({
  subject: updateTeam,
  name: "rename the target's team",
  run: (scope, target) => updateTeam(scope, target.teamId, { name: 'Harness renamed' }, 1),
});

registerIsolationCase({
  subject: setTeamBinned,
  name: "move the target's team to the bin",
  run: (scope, target) => setTeamBinned(scope, target.teamId, true),
});

registerCommandCase(createTeam, harnessTx, {
  name: "add a team to the target's season",
  input: (target) => ({
    seasonId: target.seasonId,
    name: 'Harness team',
    shortName: 'harness-team',
    statsVisibility: 'everyone',
  }),
});

registerCommandCase(updateTeamCommand, harnessTx, {
  name: "rename the target's team",
  input: (target) => ({ teamId: target.teamId, version: 1, name: 'Harness renamed' }),
});

registerCommandCase(removeTeam, harnessTx, {
  name: "move the target's team to the bin",
  input: (target) => ({ teamId: target.teamId }),
});

registerCommandCase(setTeamStatsVisibility, harnessTx, {
  name: "set who sees the target team's numbers",
  input: (target) => ({ teamId: target.teamId, version: 1, statsVisibility: 'everyone' }),
});

registerIsolationCase({
  subject: findRosterEntry,
  name: "find the target's roster entry",
  run: (scope, target) => findRosterEntry(scope, target.rosterEntryId),
});

registerIsolationCase({
  subject: listRoster,
  name: "list the target team's roster",
  run: (scope, target) => listRoster(scope, target.teamId),
});

registerIsolationCase({
  subject: insertRosterEntry,
  name: "put a person on a team of the scope's league",
  run: async (scope) => {
    const { teamId, personId } = await ownTeamAndPerson(scope);
    return insertRosterEntry(scope, {
      teamId,
      personId,
      jerseyNumber: '9',
      role: 'player',
      joinedOn: null,
    });
  },
});

registerIsolationCase({
  subject: updateRosterEntry,
  name: "mark the target's roster entry as left",
  run: (scope, target) =>
    updateRosterEntry(scope, target.rosterEntryId, { leftOn: '2026-12-01' }, 1),
});

// The target's person who left (so not on a roster now), and its one roster entry.
registerCommandCase(addToRoster, harnessTx, {
  name: "put the target's former player back on the target's team",
  input: (target) => ({ teamId: target.teamId, personId: target.formerPlayerId }),
});

registerCommandCase(changeRosterEntry, harnessTx, {
  name: "change the number of the target's roster entry",
  input: (target) => ({ rosterEntryId: target.rosterEntryId, version: 1, jerseyNumber: '24' }),
});

registerCommandCase(reorderRoster, harnessTx, {
  name: "reorder the target team's roster",
  input: (target) => ({ teamId: target.teamId, rosterEntryIds: [target.rosterEntryId] }),
});

registerCommandCase(markLeft, harnessTx, {
  name: "mark the target's roster entry as left",
  input: (target) => ({ rosterEntryId: target.rosterEntryId, version: 1, leftOn: '2026-12-01' }),
});

registerCommandCase(listRosterCommand, harnessTx, {
  name: "list the target team's roster",
  input: (target) => ({ teamId: target.teamId }),
});
