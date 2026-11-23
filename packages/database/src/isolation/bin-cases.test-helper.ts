// The two-league harness's cases for the bin (step 2.76, T-65): every query in ../queries
// for it and every command of the same step. Imported by isolation-cases.test-helper.ts.
//
// Only one game of the target league is in its bin to begin with, so a case that must
// reach the target puts something there first (the target's own empty venue, a former
// player, its scheduled game). Step 2.224 (D-M1): it does so in its `arrange`, inside the
// target's own fence, so it is there in every run; the same writes in `run` go through
// the run's own fence, and in another league's scope find nothing of the target, which a
// query with its league filter taken out would then not reach either.
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
import { harnessNow, type LeagueRecords } from './two-leagues.test-helper.ts';

const farFuture = new Date('9999-01-01T00:00:00.000Z');
/** When the arranged parts went to the bin: fixed, so every run sees the same rows. */
const binnedAt = new Date(harnessNow - 86_400_000);

/** Moves the target's scheduled game to the bin, as a publish would. */
async function binUpcomingGame(scope: LeagueScope, target: LeagueRecords) {
  await transactionOf(scope)
    .updateTable('games')
    .set({ deleted_at: binnedAt })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.upcomingGameId)
    .execute();
}

/**
 * Puts one of each kind of thing the bin lists in the target's bin (step 2.224): its
 * team, sub-division, venue with its court, empty venue, former player and scheduled
 * game, beside the game the seed already binned. A list or purge that lost one branch's
 * league filter then reaches the target in the code-only run.
 */
async function binTargetsParts(scope: LeagueScope, target: LeagueRecords) {
  const trx = transactionOf(scope);
  const bin = { deleted_at: binnedAt };
  const own = scope.leagueId;
  await trx
    .updateTable('teams')
    .set(bin)
    .where('league_id', '=', own)
    .where('id', '=', target.opponentId)
    .execute();
  await trx
    .updateTable('divisions')
    .set(bin)
    .where('league_id', '=', own)
    .where('id', '=', target.subDivisionId)
    .execute();
  await trx
    .updateTable('venues')
    .set(bin)
    .where('league_id', '=', own)
    .where('id', 'in', [target.venueId, target.emptyVenueId])
    .execute();
  await trx
    .updateTable('courts')
    .set(bin)
    .where('league_id', '=', own)
    .where('id', '=', target.courtId)
    .execute();
  await trx
    .updateTable('people')
    .set(bin)
    .where('league_id', '=', own)
    .where('id', '=', target.formerPlayerId)
    .execute();
  await binUpcomingGame(scope, target);
  // And one court, team and person that nothing points at, so the purge removes them for
  // good: the seed's own binned parts are all still named by something, which the purge
  // keeps. Fixed ids and times: every run of the case meets the same rows.
  const stamp = { deleted_at: binnedAt, created_at: binnedAt, updated_at: binnedAt };
  await trx
    .insertInto('courts')
    .values({
      id: purgeable.courtId,
      league_id: own,
      venue_id: target.venueId,
      name: `Spare court ${target.marker}`,
      ...stamp,
    })
    .execute();
  await trx
    .insertInto('teams')
    .values({
      id: purgeable.teamId,
      lineage_id: purgeable.teamId,
      league_id: own,
      season_id: target.seasonId,
      division_id: target.divisionId,
      slug: `${target.marker}-spare-team`,
      name: `Spare team ${target.marker}`,
      stats_visibility: 'everyone',
      ...stamp,
    })
    .execute();
  await trx
    .insertInto('people')
    .values({
      id: purgeable.personId,
      league_id: own,
      first_name: target.marker,
      last_name: 'Spare',
      ...stamp,
    })
    .execute();
}

/** The ids of the arranged court, team and person nothing points at. */
const purgeable = {
  courtId: '01900000-0000-7000-8000-00000000b1c1',
  teamId: '01900000-0000-7000-8000-00000000b1c2',
  personId: '01900000-0000-7000-8000-00000000b1c3',
};

const setVenueBinnedAt = (scope: LeagueScope, venueId: string) =>
  transactionOf(scope)
    .updateTable('venues')
    .set({ deleted_at: binnedAt })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', venueId)
    .execute();

registerIsolationCase({
  subject: listBinned,
  arrange: binTargetsParts,
  name: "list the bin after the target's empty venue went there",
  run: async (scope, target) => {
    await setVenueBinned(scope, target.emptyVenueId, true);
    return listBinned(scope);
  },
});

registerIsolationCase({
  subject: hasBinnedGamePart,
  name: "ask whether the target's game names a venue in the bin",
  arrange: (scope, target) => setVenueBinnedAt(scope, target.venueId),
  run: async (scope, target) => {
    await setVenueBinned(scope, target.venueId, true);
    return hasBinnedGamePart(scope, target.gameId);
  },
});

registerIsolationCase({
  subject: restoreBinnedGame,
  name: "bring back the target's game a publish removed",
  arrange: binUpcomingGame,
  run: async (scope, target) => {
    await binUpcomingGame(scope, target);
    return restoreBinnedGame(scope, target.upcomingGameId);
  },
});

registerIsolationCase({
  subject: restoreBinnedPerson,
  name: "bring back the target's former player from the bin",
  arrange: (scope, target) =>
    transactionOf(scope)
      .updateTable('people')
      .set({ deleted_at: binnedAt })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', target.formerPlayerId)
      .execute(),
  run: async (scope, target) => {
    await setPersonBinned(scope, target.formerPlayerId, true);
    return restoreBinnedPerson(scope, target.formerPlayerId);
  },
});

registerIsolationCase({
  subject: purgeBinned,
  name: "empty the bin for good after the target's empty venue went there",
  arrange: binTargetsParts,
  run: async (scope, target) => {
    await setVenueBinned(scope, target.emptyVenueId, true);
    return purgeBinned(scope, farFuture);
  },
});

registerIsolationCase({
  subject: listBin,
  name: "list the bin after the target's empty venue went there",
  arrange: binTargetsParts,
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
