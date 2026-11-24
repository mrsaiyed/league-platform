// The scheduling module's store (core's SchedulingStore), bound to one league scope.
import type { SchedulingStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  binPublishedGames,
  countPeopleOnTeams,
  findSeasonRules,
  insertPublishedGames,
  insertScheduleRevision,
  listGamesById,
  updatePublishedGame,
  updateRound,
  insertRounds,
  deleteRounds,
  listGamesInRounds,
  deleteScheduleDraft,
  findCourt,
  findPlaceGames,
  findScheduleDraft,
  findSeasonProgramId,
  seasonIsArchived,
  insertScheduleDraft,
  latestScheduleRevision,
  listLeftTeamsOfSeason,
  listTeamsOfSeason,
  loadSchedule,
  updateScheduleDraft,
  findVenue,
  hasLiveCourts,
  insertCourt,
  insertVenue,
  listCourts,
  listVenues,
  setCourtBinned,
  setVenueBinned,
  updateCourt,
  updateVenue,
} from '../queries/index.ts';

export function schedulingStore(scope: LeagueScope): SchedulingStore {
  return {
    findSeason: async (seasonId) => {
      const programId = await findSeasonProgramId(scope, seasonId);
      return programId === undefined ? undefined : { programId };
    },
    seasonArchived: (seasonId) => seasonIsArchived(scope, seasonId),
    latestRevision: (seasonId) => latestScheduleRevision(scope, seasonId),
    findDraft: (seasonId) => findScheduleDraft(scope, seasonId),
    insertDraft: (seasonId, changes, basedOn) =>
      insertScheduleDraft(scope, seasonId, changes, basedOn),
    updateDraft: (seasonId, draftId, changes, version) =>
      updateScheduleDraft(scope, seasonId, draftId, changes, version),
    deleteDraft: (seasonId, draftId, version) =>
      deleteScheduleDraft(scope, seasonId, draftId, version),
    loadSchedule: (seasonId) => loadSchedule(scope, seasonId),
    seasonRules: (seasonId) => findSeasonRules(scope, seasonId),
    gamesById: (seasonId, gameIds) => listGamesById(scope, seasonId, gameIds),
    countPeopleOnTeams: (seasonId, teamIds) => countPeopleOnTeams(scope, seasonId, teamIds),
    insertPublishedGames: (seasonId, games) => insertPublishedGames(scope, seasonId, games),
    updatePublishedGame: (seasonId, gameId, change) =>
      updatePublishedGame(scope, seasonId, gameId, change),
    binPublishedGames: (seasonId, gameIds) => binPublishedGames(scope, seasonId, gameIds),
    updateRound: (seasonId, roundId, change) => updateRound(scope, seasonId, roundId, change),
    insertRounds: (seasonId, rounds) => insertRounds(scope, seasonId, rounds),
    deleteRounds: (seasonId, roundIds) => deleteRounds(scope, seasonId, roundIds),
    gamesInRounds: (seasonId, roundIds) => listGamesInRounds(scope, seasonId, roundIds),
    insertRevision: (seasonId, revision) => insertScheduleRevision(scope, seasonId, revision),
    teamsOfSeason: (seasonId, teamIds) => listTeamsOfSeason(scope, seasonId, teamIds),
    leftTeamsOfSeason: (seasonId, teamIds) => listLeftTeamsOfSeason(scope, seasonId, teamIds),
    findVenue: (venueId) => findVenue(scope, venueId),
    listVenues: () => listVenues(scope),
    createVenue: (venue) => insertVenue(scope, venue),
    updateVenue: (venueId, change, version) => updateVenue(scope, venueId, change, version),
    setVenueBinned: (venueId, binned) => setVenueBinned(scope, venueId, binned),
    hasLiveCourts: (venueId) => hasLiveCourts(scope, venueId),
    listCourts: (venueId) => listCourts(scope, venueId),
    findCourt: (courtId) => findCourt(scope, courtId),
    createCourt: (court) => insertCourt(scope, court),
    updateCourt: (courtId, change, version) => updateCourt(scope, courtId, change, version),
    setCourtBinned: (courtId, binned) => setCourtBinned(scope, courtId, binned),
    placeGames: () => findPlaceGames(scope),
  };
}
