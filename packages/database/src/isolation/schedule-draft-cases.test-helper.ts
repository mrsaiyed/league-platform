// The two-league harness's cases for the schedule draft (step 2.20, T-65): every query in
// ../queries for it and every command of the same step. Imported by
// isolation-cases.test-helper.ts. The seeded season has one published revision (1) and a
// draft on it at version 1, so each edit names those as its basis.
import {
  addDraftGame,
  changeDraftRoundDate,
  discardScheduleDraft,
  getScheduleDraft,
  moveDraftGame,
  removeDraftGame,
  renameDraftRound,
  setDraftRecording,
  swapDraftGames,
  type DraftDocument,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  deleteScheduleDraft,
  findScheduleDraft,
  insertScheduleDraft,
  latestScheduleRevision,
  listTeamsOfSeason,
  loadSchedule,
  updateScheduleDraft,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

// A write needs a season of the scope's own league: a refusal naming the target's ids
// would be a leak. With none in sight (the run whose fence is set to another league) it
// uses an id that is nowhere.
async function ownSeasonId(scope: LeagueScope) {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .limit(1)
    .executeTakeFirst();
  return row?.id ?? randomUUID();
}

const emptyDocument: DraftDocument = { version: 1, changes: [] };

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: findScheduleDraft,
  name: "find the target's season's draft",
  run: (scope, target) => findScheduleDraft(scope, target.seasonId),
});

registerIsolationCase({
  subject: latestScheduleRevision,
  name: "read the latest revision of the target's season",
  run: (scope, target) => latestScheduleRevision(scope, target.seasonId),
});

registerIsolationCase({
  subject: loadSchedule,
  name: "load the target's season's published schedule",
  run: (scope, target) => loadSchedule(scope, target.seasonId),
});

registerIsolationCase({
  subject: listTeamsOfSeason,
  name: "ask which of the target's teams are the target's season's",
  run: (scope, target) =>
    listTeamsOfSeason(scope, target.seasonId, [target.teamId, target.opponentId]),
});

registerIsolationCase({
  subject: updateScheduleDraft,
  name: "save the target's season's draft",
  run: (scope, target) => updateScheduleDraft(scope, target.seasonId, emptyDocument, 1),
});

registerIsolationCase({
  subject: deleteScheduleDraft,
  name: "discard the target's season's draft",
  run: (scope, target) => deleteScheduleDraft(scope, target.seasonId, 1),
});

registerIsolationCase({
  subject: insertScheduleDraft,
  name: "start a draft for the scope's own season, after discarding the seeded one",
  run: async (scope) => {
    const seasonId = await ownSeasonId(scope);
    await deleteScheduleDraft(scope, seasonId, 1);
    return insertScheduleDraft(scope, seasonId, emptyDocument, 1);
  },
});

// Commands ----------------------------------------------------------------------------

const basis = (target: LeagueRecords) => ({
  seasonId: target.seasonId,
  basedOnRevision: 1,
  version: 1,
});

const newGameId = '01900000-0000-7000-8000-0000000a0001';

registerCommandCase(addDraftGame, harnessTx, {
  name: "add a game to the target's season's draft",
  input: (target) => ({
    ...basis(target),
    gameId: newGameId,
    homeTeamId: target.teamId,
    awayTeamId: target.opponentId,
    roundId: target.roundId,
    date: '2026-12-20',
    time: '20:00',
    venueId: target.venueId,
    court: null,
  }),
});

registerCommandCase(moveDraftGame, harnessTx, {
  name: "move the target's upcoming game in its draft",
  input: (target) => ({
    ...basis(target),
    gameId: target.upcomingGameId,
    roundId: target.roundId,
    date: '2026-12-20',
    time: '18:00',
    venueId: target.venueId,
    court: null,
  }),
});

registerCommandCase(swapDraftGames, harnessTx, {
  name: "swap the target's two games in its draft",
  input: (target) => ({
    ...basis(target),
    gameId: target.gameId,
    otherGameId: target.upcomingGameId,
  }),
});

registerCommandCase(removeDraftGame, harnessTx, {
  name: "remove the target's upcoming game in its draft",
  input: (target) => ({ ...basis(target), gameId: target.upcomingGameId }),
});

registerCommandCase(renameDraftRound, harnessTx, {
  name: "rename the target's round in its draft",
  input: (target) => ({ ...basis(target), roundId: target.roundId, label: 'Opening night' }),
});

registerCommandCase(changeDraftRoundDate, harnessTx, {
  name: "change the target's round's date in its draft",
  input: (target) => ({ ...basis(target), roundId: target.roundId, date: '2026-12-07' }),
});

registerCommandCase(setDraftRecording, harnessTx, {
  name: "set how the target's upcoming game is recorded in its draft",
  input: (target) => ({ ...basis(target), gameId: target.upcomingGameId, recording: 'live' }),
});

registerCommandCase(discardScheduleDraft, harnessTx, {
  name: "discard the target's season's draft",
  input: (target) => ({ seasonId: target.seasonId, version: 1 }),
});

registerCommandCase(getScheduleDraft, harnessTx, {
  name: "read the target's season's draft",
  input: (target) => ({ seasonId: target.seasonId }),
});
