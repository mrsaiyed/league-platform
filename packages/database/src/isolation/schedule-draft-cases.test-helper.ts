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
  previewSchedulePublish,
  publishSchedule,
  removeDraftGame,
  renameDraftRound,
  setDraftRecording,
  swapDraftGames,
  type DraftDocument,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  binPublishedGames,
  countPeopleOnTeams,
  deleteScheduleDraft,
  findScheduleDraft,
  findSeasonRules,
  insertPublishedGames,
  insertScheduleDraft,
  insertScheduleRevision,
  latestScheduleRevision,
  listGamesById,
  listTeamsOfSeason,
  loadSchedule,
  updatePublishedGame,
  updateRound,
  updateScheduleDraft,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase, runAsApp } from './command-cases.test-helper.ts';
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
  run: (scope, target) =>
    updateScheduleDraft(scope, target.seasonId, target.scheduleDraftId, emptyDocument, 1),
});

registerIsolationCase({
  subject: deleteScheduleDraft,
  name: "discard the target's season's draft",
  run: (scope, target) => deleteScheduleDraft(scope, target.seasonId, target.scheduleDraftId, 1),
});

registerIsolationCase({
  subject: insertScheduleDraft,
  name: "start a draft for the target's season, then for the scope's own after discarding its seeded one",
  run: async (scope, target) => {
    // The target's season: it has a draft already, so a run that can reach it is told so,
    // and one that cannot is told there is no such season, naming nothing of it.
    const attempt = await insertScheduleDraft(scope, target.seasonId, emptyDocument, 1);
    const seasonId = await ownSeasonId(scope);
    const own = await transactionOf(scope)
      .selectFrom('schedule_drafts')
      .select('id')
      .where('league_id', '=', scope.leagueId)
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    if (own !== undefined) await deleteScheduleDraft(scope, seasonId, own.id, 1);
    return { attempt, started: await insertScheduleDraft(scope, seasonId, emptyDocument, 1) };
  },
});

// Commands ----------------------------------------------------------------------------

const basis = (target: LeagueRecords) => ({
  seasonId: target.seasonId,
  basedOnRevision: 1,
  version: 1,
  draftId: target.scheduleDraftId,
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
  input: (target) => ({
    seasonId: target.seasonId,
    draftId: target.scheduleDraftId,
    version: 1,
  }),
});

registerCommandCase(getScheduleDraft, harnessTx, {
  name: "read the target's season's draft",
  input: (target) => ({ seasonId: target.seasonId }),
});

// Publishing (step 2.21) -----------------------------------------------------------------

registerIsolationCase({
  subject: findSeasonRules,
  name: "read the target's season's rules",
  run: (scope, target) => findSeasonRules(scope, target.seasonId),
});

registerIsolationCase({
  subject: listGamesById,
  name: "look up the target's two games",
  run: (scope, target) =>
    listGamesById(scope, target.seasonId, [target.gameId, target.upcomingGameId]),
});

registerIsolationCase({
  subject: countPeopleOnTeams,
  name: "count the people on the target's teams",
  run: (scope, target) =>
    countPeopleOnTeams(scope, target.seasonId, [target.teamId, target.opponentId]),
});

registerIsolationCase({
  subject: insertPublishedGames,
  name: "create a game between the target's teams in its season",
  run: (scope, target) =>
    insertPublishedGames(scope, target.seasonId, [
      {
        id: randomUUID(),
        roundId: target.roundId,
        date: '2026-12-20',
        time: '20:00',
        venueId: target.venueId,
        court: null,
        homeTeamId: target.teamId,
        awayTeamId: target.opponentId,
        captureMode: 'final',
      },
    ]),
});

registerIsolationCase({
  subject: updatePublishedGame,
  name: "move the target's upcoming game",
  run: (scope, target) =>
    updatePublishedGame(scope, target.seasonId, target.upcomingGameId, {
      slot: {
        roundId: target.roundId,
        date: '2026-12-21',
        time: '19:00',
        venueId: target.venueId,
        court: null,
      },
      captureMode: 'live',
    }),
});

registerIsolationCase({
  subject: binPublishedGames,
  name: "bin the target's upcoming game",
  run: (scope, target) => binPublishedGames(scope, target.seasonId, [target.upcomingGameId]),
});

registerIsolationCase({
  subject: updateRound,
  name: "rename the target's round",
  run: (scope, target) =>
    updateRound(scope, target.seasonId, target.roundId, { label: 'Opening night' }),
});

registerIsolationCase({
  subject: insertScheduleRevision,
  name: "write the target's season's second revision",
  run: (scope, target) =>
    insertScheduleRevision(scope, target.seasonId, {
      number: 2,
      publishedByAccountId: null,
      summary: { version: 1 },
    }),
});

registerCommandCase(previewSchedulePublish, harnessTx, {
  name: "preview publishing the target's season's draft",
  input: (target) => ({ seasonId: target.seasonId }),
});

// The seeded draft changes nothing, so the case first puts one move into it (a run in
// another league finds no such draft and changes nothing), then publishes it.
registerIsolationCase({
  subject: publishSchedule,
  name: "publish the target's season's draft holding a move of its upcoming game",
  run: async (scope, target) => {
    const move: DraftDocument = {
      version: 1,
      changes: [
        {
          kind: 'move-game',
          gameId: target.upcomingGameId,
          to: {
            roundId: target.roundId,
            date: '2026-12-20',
            time: '18:00',
            venueId: target.venueId,
            court: null,
          },
        },
      ],
    };
    await updateScheduleDraft(scope, target.seasonId, target.scheduleDraftId, move, 1);
    return runAsApp(publishSchedule, harnessTx, scope, {
      seasonId: target.seasonId,
      basedOnRevision: 1,
      draftId: target.scheduleDraftId,
      version: 2,
    });
  },
});
