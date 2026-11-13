// The two-league harness's cases for teams (step 2.18, T-65): every query in ../queries
// for them and every command of the same step. Imported by isolation-cases.test-helper.ts.
import {
  createTeam,
  removeTeam,
  setTeamStatsVisibility,
  updateTeam as updateTeamCommand,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { findTeam, insertTeam, setTeamBinned, updateTeam } from '../queries/index.ts';
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
