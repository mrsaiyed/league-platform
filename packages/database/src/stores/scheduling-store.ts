// The scheduling module's store (core's SchedulingStore), bound to one league scope.
import type { SchedulingStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findCourt,
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
