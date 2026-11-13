// The scheduling module's store (core's SchedulingStore), bound to one league scope.
import type { SchedulingStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  deleteScheduleDraft,
  findCourt,
  findScheduleDraft,
  findSeasonProgramId,
  insertScheduleDraft,
  latestScheduleRevision,
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
    latestRevision: (seasonId) => latestScheduleRevision(scope, seasonId),
    findDraft: (seasonId) => findScheduleDraft(scope, seasonId),
    insertDraft: (seasonId, changes, basedOn) =>
      insertScheduleDraft(scope, seasonId, changes, basedOn),
    updateDraft: (seasonId, draftId, changes, version) =>
      updateScheduleDraft(scope, seasonId, draftId, changes, version),
    deleteDraft: (seasonId, draftId, version) =>
      deleteScheduleDraft(scope, seasonId, draftId, version),
    loadSchedule: (seasonId) => loadSchedule(scope, seasonId),
    teamsOfSeason: (seasonId, teamIds) => listTeamsOfSeason(scope, seasonId, teamIds),
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
  };
}
