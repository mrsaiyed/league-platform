// The two-league harness's cases for the public schedule, teams and roster queries
// (step 2.39, T-65). The seeded season is still being set up, which a public page may
// not show, so each case first opens the scope's own season to the public (inside the
// run's rolled-back transaction), as a published season would be.
import { defaultNamePolicy, publicViewer, type PublicDisplay } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  findLeagueName,
  findLeagueTimeZone,
  findLeagueToday,
  findPublicGameFacts,
  findPublicSeason,
  findPublicTeam,
  listPublicGames,
  listPublicRoster,
  listPublicSchedule,
  listPublicSeasons,
  listPublicTeams,
  listTeamsOfAccount,
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

/**
 * Sets the target league apart from the scope's (step 2.224, D-M1): another time zone,
 * whose day differs from the scope's at the harness's clock, and another audience. A
 * read of "the league's own" row that lost its filter then answers with the target's.
 * Used as a case's `arrange`, so inside the target's own fence.
 */
export async function setTargetLeagueApart(inTarget: LeagueScope) {
  await transactionOf(inTarget)
    .updateTable('leagues')
    .set({ time_zone: 'Pacific/Kiritimati', audience: 'youth' })
    .where('id', '=', inTarget.leagueId)
    .execute();
}

/**
 * Writes the scope's own league row again (inside the run's rolled-back transaction), so
 * the database keeps it after the other league's: a read that lost its
 * `where id = scope.leagueId` would meet the target's row first and name it. Where the
 * fence refuses the write, nothing is moved and the read goes on.
 */
export async function moveOwnLeagueRowLast(scope: LeagueScope) {
  const trx = transactionOf(scope);
  await sql`savepoint move_league_row`.execute(trx);
  try {
    await trx
      .updateTable('leagues')
      .set({ name: sql<string>`name` })
      .where('id', '=', scope.leagueId)
      .execute();
    await sql`release savepoint move_league_row`.execute(trx);
  } catch {
    await sql`rollback to savepoint move_league_row`.execute(trx);
  }
}

registerIsolationCase({
  subject: listPublicSeasons,
  name: "list the seasons a visitor can pick after opening the target's",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicSeasons(scope);
  },
});

registerIsolationCase({
  subject: findPublicSeason,
  name: "find the target's season by its short name after opening it",
  arrange: openTargetSeason,
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
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicGames(scope, target.seasonId, target.teamId);
  },
});

registerIsolationCase({
  subject: listPublicSchedule,
  name: "list the target season's schedule by round after opening it",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicSchedule(scope, target.seasonId, '2026-11-13');
  },
});

registerIsolationCase({
  subject: findPublicGameFacts,
  name: "find the target's final game's number, venue and season after opening its season",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return findPublicGameFacts(scope, target.seasonId, target.gameId);
  },
});

registerIsolationCase({
  subject: findLeagueTimeZone,
  name: "read the league's time zone (the target's own, in its scope)",
  arrange: setTargetLeagueApart,
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    return findLeagueTimeZone(scope);
  },
});

registerIsolationCase({
  subject: findLeagueToday,
  name: "read the league's today (the target's own, in its scope)",
  arrange: setTargetLeagueApart,
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    return findLeagueToday(scope);
  },
});

registerIsolationCase({
  subject: listPublicTeams,
  name: "list the target season's teams after opening it",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listPublicTeams(scope, target.seasonId, displayFor(scope));
  },
});

registerIsolationCase({
  subject: findPublicTeam,
  name: "find the target's team by its short name after opening its season",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    // The target's short name as the seed made it (step 2.224): read through the run's
    // own fence it was "nobody" in another league's runs, which no query could find.
    return findPublicTeam(scope, target.seasonId, target.teamSlug, displayFor(scope));
  },
});

registerIsolationCase({
  subject: findLeagueName,
  name: "read the league's own name, its row moved after the target's (the target's, in its scope)",
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    return findLeagueName(scope);
  },
});

registerIsolationCase({
  subject: listTeamsOfAccount,
  name: "list the target team as the scope's account's own, after linking the target's player to it in any league",
  run: async (scope, target) => {
    // One account with roster places in two leagues: the target's player is linked to the
    // scope's account's own profile WITH NO league filter, so in the code-only run (no
    // fence) only the query's own league filters keep the target's team out, and in the
    // target's own league (the control) it comes back. The link is undone before the run
    // ends (a savepoint), so the run itself changes nothing of the target's league.
    const trx = transactionOf(scope);
    const own = await trx
      .selectFrom('profile_access')
      .select('profile_id')
      .where('account_id', '=', scope.accountId ?? '')
      .where('relation', '=', 'self')
      .executeTakeFirst();
    await sql`savepoint link_target_player`.execute(trx);
    await trx
      .updateTable('people')
      .set({ profile_id: own?.profile_id ?? null })
      .where('id', '=', target.personId)
      .execute();
    const teams = await listTeamsOfAccount(scope, target.seasonId);
    await sql`rollback to savepoint link_target_player`.execute(trx);
    return teams;
  },
});

registerIsolationCase({
  subject: listPublicRoster,
  name: "list the target team's public roster after opening its season",
  arrange: async (scope, target) => {
    await openTargetSeason(scope, target);
    await setTargetLeagueApart(scope);
  },
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    await moveOwnLeagueRowLast(scope);
    return listPublicRoster(scope, target.teamId, displayFor(scope));
  },
});
