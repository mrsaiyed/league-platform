// The two-league harness's cases for divisions, venues and courts (step 2.16, T-65):
// every query in ../queries for them and every command of the same step. Imported by
// isolation-cases.test-helper.ts, which registers the rest.
import {
  createCourt,
  createDivision,
  createVenue,
  listDivisions as listDivisionsCommand,
  listVenues as listVenuesCommand,
  removeCourt,
  removeDivision,
  removeVenue,
  reorderDivisions,
  restoreCourt,
  restoreDivision,
  restoreVenue,
  updateCourt as updateCourtCommand,
  updateDivision as updateDivisionCommand,
  updateVenue as updateVenueCommand,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  findCourt,
  findDivision,
  findVenue,
  hasLiveCourts,
  hasLiveSubdivisions,
  insertCourt,
  insertDivision,
  insertVenue,
  listDivisions,
  listVenues,
  setCourtBinned,
  setDivisionBinned,
  setVenueBinned,
  updateCourt,
  updateDivision,
  updateVenue,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

// A case that writes needs a place of the scope's own league (a season, a venue): a
// refusal naming the target's ids would be a leak. With none in sight (the run whose
// fence is set to another league) it uses an id that is nowhere.
async function ownSeasonId(scope: LeagueScope) {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .limit(1)
    .executeTakeFirst();
  return row?.id ?? randomUUID();
}

async function ownVenueId(scope: LeagueScope) {
  const row = await transactionOf(scope)
    .selectFrom('venues')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .limit(1)
    .executeTakeFirst();
  return row?.id ?? randomUUID();
}

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: findDivision,
  name: "find the target's division",
  run: (scope, target) => findDivision(scope, target.divisionId),
});

registerIsolationCase({
  subject: listDivisions,
  name: "list the target's season's divisions",
  run: (scope, target) => listDivisions(scope, target.seasonId),
});

registerIsolationCase({
  subject: insertDivision,
  name: "add a division to a season of the scope's league",
  run: async (scope) =>
    insertDivision(scope, {
      seasonId: await ownSeasonId(scope),
      parentDivisionId: null,
      name: 'Harness division',
      color: null,
      sort: 0,
    }),
});

registerIsolationCase({
  subject: updateDivision,
  name: "rename the target's division",
  run: (scope, target) => updateDivision(scope, target.divisionId, { name: 'Harness renamed' }, 1),
});

registerIsolationCase({
  subject: setDivisionBinned,
  name: "move the target's division to the bin",
  run: (scope, target) => setDivisionBinned(scope, target.divisionId, true),
});

registerIsolationCase({
  subject: hasLiveSubdivisions,
  name: "ask about the target's division's sub-divisions",
  run: (scope, target) => hasLiveSubdivisions(scope, target.divisionId),
});

registerIsolationCase({
  subject: findVenue,
  name: "find the target's venue",
  run: (scope, target) => findVenue(scope, target.venueId),
});

registerIsolationCase({
  subject: listVenues,
  name: "list the scope's venues with their courts",
  run: (scope) => listVenues(scope),
});

registerIsolationCase({
  subject: insertVenue,
  name: "add a venue to the scope's league",
  run: (scope) => insertVenue(scope, { name: 'Harness venue', address: null, mapLink: null }),
});

registerIsolationCase({
  subject: updateVenue,
  name: "rename the target's venue",
  run: (scope, target) => updateVenue(scope, target.venueId, { name: 'Harness renamed' }, 1),
});

registerIsolationCase({
  subject: setVenueBinned,
  name: "move the target's venue with no court to the bin",
  run: (scope, target) => setVenueBinned(scope, target.emptyVenueId, true),
});

registerIsolationCase({
  subject: hasLiveCourts,
  name: "ask about the target's venue's courts",
  run: (scope, target) => hasLiveCourts(scope, target.venueId),
});

registerIsolationCase({
  subject: findCourt,
  name: "find the target's court",
  run: (scope, target) => findCourt(scope, target.courtId),
});

registerIsolationCase({
  subject: insertCourt,
  name: "add a court to a venue of the scope's league",
  run: async (scope) =>
    insertCourt(scope, { venueId: await ownVenueId(scope), name: 'Harness court', sort: 0 }),
});

registerIsolationCase({
  subject: updateCourt,
  name: "rename the target's court",
  run: (scope, target) => updateCourt(scope, target.courtId, { name: 'Harness renamed' }, 1),
});

registerIsolationCase({
  subject: setCourtBinned,
  name: "move the target's court to the bin",
  run: (scope, target) => setCourtBinned(scope, target.courtId, true),
});

// Commands ----------------------------------------------------------------------------

registerCommandCase(createDivision, harnessTx, {
  name: "add a division to the target's season",
  input: (target) => ({ seasonId: target.seasonId, name: 'Harness division' }),
});

registerCommandCase(updateDivisionCommand, harnessTx, {
  name: "rename the target's division",
  input: (target) => ({ divisionId: target.divisionId, version: 1, name: 'Harness renamed' }),
});

registerCommandCase(reorderDivisions, harnessTx, {
  name: "order the target's season's top divisions",
  input: (target) => ({ seasonId: target.seasonId, divisionIds: [target.divisionId] }),
});

registerCommandCase(removeDivision, harnessTx, {
  name: "move the target's sub-division to the bin",
  input: (target) => ({ divisionId: target.subDivisionId }),
});

registerCommandCase(restoreDivision, harnessTx, {
  name: "restore the target's division",
  input: (target) => ({ divisionId: target.divisionId }),
});

registerCommandCase(listDivisionsCommand, harnessTx, {
  name: "list the target's season's divisions",
  input: (target) => ({ seasonId: target.seasonId }),
});

registerCommandCase(createVenue, harnessTx, {
  name: 'add a venue',
  input: () => ({ name: 'Harness venue', address: '1 Harness Street' }),
});

registerCommandCase(updateVenueCommand, harnessTx, {
  name: "rename the target's venue",
  input: (target) => ({ venueId: target.venueId, version: 1, name: 'Harness renamed' }),
});

registerCommandCase(removeVenue, harnessTx, {
  name: "move the target's venue with no court to the bin",
  input: (target) => ({ venueId: target.emptyVenueId }),
});

registerCommandCase(restoreVenue, harnessTx, {
  name: "restore the target's venue",
  input: (target) => ({ venueId: target.venueId }),
});

registerCommandCase(createCourt, harnessTx, {
  name: "add a court to the target's venue",
  input: (target) => ({ venueId: target.venueId, name: 'Harness court' }),
});

registerCommandCase(updateCourtCommand, harnessTx, {
  name: "rename the target's court",
  input: (target) => ({ courtId: target.courtId, version: 1, name: 'Harness renamed' }),
});

registerCommandCase(removeCourt, harnessTx, {
  name: "move the target's court to the bin",
  input: (target) => ({ courtId: target.courtId }),
});

registerCommandCase(restoreCourt, harnessTx, {
  name: "restore the target's court",
  input: (target) => ({ courtId: target.courtId }),
});

registerCommandCase(listVenuesCommand, harnessTx, {
  name: "list the scope's venues",
  input: () => ({}),
});
