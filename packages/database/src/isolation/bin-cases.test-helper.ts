// The two-league harness's cases for the bin (step 2.76, T-65): every query in ../queries
// for it and every command of the same step. Imported by isolation-cases.test-helper.ts.
//
// Nothing of the target league is in its bin to begin with, so a case that must reach
// the target puts something there first (the target's own empty venue, a former player,
// its scheduled game) through the same fence the case runs in: in another league's
// scope those writes find nothing, and the case then proves it could not reach it.
import { listBin, restoreGame, restorePerson, restoreTeam } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  hasBinnedGamePart,
  listBinned,
  purgeBinned,
  restoreBinnedGame,
  restoreBinnedPerson,
  setPersonBinned,
  setVenueBinned,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase, runAsApp } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

const farFuture = new Date('9999-01-01T00:00:00.000Z');

/** Moves the target's scheduled game to the bin, as a publish would. */
async function binUpcomingGame(scope: LeagueScope, target: LeagueRecords) {
  await transactionOf(scope)
    .updateTable('games')
    .set({ deleted_at: new Date() })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.upcomingGameId)
    .execute();
}

registerIsolationCase({
  subject: listBinned,
  name: "list the bin after the target's empty venue went there",
  run: async (scope, target) => {
    await setVenueBinned(scope, target.emptyVenueId, true);
    return listBinned(scope);
  },
});

registerIsolationCase({
  subject: hasBinnedGamePart,
  name: "ask whether the target's game names a venue in the bin",
  run: async (scope, target) => {
    await setVenueBinned(scope, target.venueId, true);
    return hasBinnedGamePart(scope, target.gameId);
  },
});

registerIsolationCase({
  subject: restoreBinnedGame,
  name: "bring back the target's game a publish removed",
  run: async (scope, target) => {
    await binUpcomingGame(scope, target);
    return restoreBinnedGame(scope, target.upcomingGameId);
  },
});

registerIsolationCase({
  subject: restoreBinnedPerson,
  name: "bring back the target's former player from the bin",
  run: async (scope, target) => {
    await setPersonBinned(scope, target.formerPlayerId, true);
    return restoreBinnedPerson(scope, target.formerPlayerId);
  },
});

registerIsolationCase({
  subject: purgeBinned,
  name: "empty the bin for good after the target's empty venue went there",
  run: async (scope, target) => {
    await setVenueBinned(scope, target.emptyVenueId, true);
    return purgeBinned(scope, farFuture);
  },
});

registerIsolationCase({
  subject: listBin,
  name: "list the bin after the target's empty venue went there",
  run: async (scope, target) => {
    await setVenueBinned(scope, target.emptyVenueId, true);
    return runAsApp(listBin, harnessTx, scope, {});
  },
});

registerCommandCase(restoreTeam, harnessTx, {
  name: "restore the target's team",
  input: (target) => ({ teamId: target.teamId }),
});

registerCommandCase(restorePerson, harnessTx, {
  name: "restore the target's former player",
  input: (target) => ({ personId: target.formerPlayerId }),
});

registerCommandCase(restoreGame, harnessTx, {
  name: "restore the target's game",
  input: (target) => ({ gameId: target.gameId }),
});
