// The two-league harness's cases for the public schedule, teams and roster queries
// (step 2.39, T-65). The seeded season is still being set up, which a public page may
// not show, so each case first opens the scope's own season to the public (inside the
// run's rolled-back transaction), as a published season would be.
import { defaultNamePolicy, publicViewer, type PublicDisplay } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  findPublicSeason,
  findPublicTeam,
  listPublicGames,
  listPublicRoster,
  listPublicSchedule,
  listPublicSeasons,
  listPublicTeams,
} from '../queries/index.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

async function openTargetSeason(scope: LeagueScope, target: LeagueRecords) {
  await transactionOf(scope)
    .updateTable('seasons')
    .set({ status: 'active', is_current: true })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.seasonId)
    .execute();
}

const displayFor = (scope: LeagueScope): PublicDisplay => ({
  viewer: publicViewer(scope.leagueId),
  policy: defaultNamePolicy,
});

registerIsolationCase({
  subject: listPublicSeasons,
  name: "list the seasons a visitor can pick after opening the target's",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicSeasons(scope);
  },
});

registerIsolationCase({
  subject: findPublicSeason,
  name: "find the target's season by its short name after opening it",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return findPublicSeason(scope, {
      seasonSlug: target.seasonSlug,
      programSlug: target.programSlug,
    });
  },
});

registerIsolationCase({
  subject: listPublicGames,
  name: "list the target team's published games after opening its season",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicGames(scope, target.seasonId, target.teamId);
  },
});

registerIsolationCase({
  subject: listPublicSchedule,
  name: "list the target season's schedule by round after opening it",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicSchedule(scope, target.seasonId, '2026-11-13');
  },
});

registerIsolationCase({
  subject: listPublicTeams,
  name: "list the target season's teams after opening it",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicTeams(scope, target.seasonId, displayFor(scope));
  },
});

registerIsolationCase({
  subject: findPublicTeam,
  name: "find the target's team by its short name after opening its season",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    const row = await transactionOf(scope)
      .selectFrom('teams')
      .select('slug')
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', target.teamId)
      .executeTakeFirst();
    return findPublicTeam(scope, target.seasonId, row?.slug ?? 'nobody', displayFor(scope));
  },
});

registerIsolationCase({
  subject: listPublicRoster,
  name: "list the target team's public roster after opening its season",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicRoster(scope, target.teamId, displayFor(scope));
  },
});
