// The two-league harness's cases for one game's own format (step 2.119): the target's
// upcoming game is scheduled, so in its own league it can be read, given a format and
// have it taken back; anywhere else there is nothing of the target's to reach.
import { clearGameFormat, giveGameFormat, readGameFormat } from '@srleagues/core';
import { formatOfRules, seasonRulesPreset } from '@srleagues/contracts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { findGameGivenFormat, updateGameGivenFormat } from '../queries/index.ts';
import { harnessTx, runAsApp } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

const quarters = formatOfRules(seasonRulesPreset('high-school'));

/** The target's upcoming game's version as read in the scope (the seed's elsewhere). */
async function versionIn(scope: LeagueScope, target: LeagueRecords): Promise<number> {
  const game = await transactionOf(scope)
    .selectFrom('games')
    .select('version')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.upcomingGameId)
    .executeTakeFirst();
  return game?.version ?? 1;
}

registerIsolationCase({
  subject: findGameGivenFormat,
  name: "read the format the target's upcoming game was given",
  run: (scope, target) => findGameGivenFormat(scope, target.upcomingGameId),
});

registerIsolationCase({
  subject: updateGameGivenFormat,
  name: "give the target's upcoming game its own format",
  run: async (scope, target) =>
    updateGameGivenFormat(scope, target.upcomingGameId, quarters, await versionIn(scope, target)),
});

registerIsolationCase({
  subject: giveGameFormat,
  name: "give the target's upcoming game its own format, as an admin",
  run: async (scope, target) =>
    runAsApp(giveGameFormat, harnessTx, scope, {
      gameId: target.upcomingGameId,
      version: await versionIn(scope, target),
      format: quarters,
    }),
});

registerIsolationCase({
  subject: clearGameFormat,
  name: "put the target's upcoming game back on its season's format",
  run: async (scope, target) =>
    runAsApp(clearGameFormat, harnessTx, scope, {
      gameId: target.upcomingGameId,
      version: await versionIn(scope, target),
    }),
});

registerIsolationCase({
  subject: readGameFormat,
  name: "read the format of the target's upcoming game",
  run: (scope, target) =>
    runAsApp(readGameFormat, harnessTx, scope, { gameId: target.upcomingGameId }),
});
