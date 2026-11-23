// The words the games area and the tracker show beside a league's games (step 2.93 part 6,
// apps/web's games.namesOf): every team of the scope's league by id and name, in the bin
// or not (and whether it is), so an old game keeps its teams' names; every season by id and name, so an earlier
// round of another season is named with its season (step 2.156); and who is assigned to
// score each game, as account ids. An account's name is not read here: the fence lets an
// account read only its own accounts row, so the caller names them through
// listAccessNames. Who may read this is the games commands' check, made by the page
// before it asks. Built field by field (T-29).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type GameNamesRows = {
  /** `removed`: in the bin (step 2.56: the list names it "(removed)"). */
  readonly teams: readonly {
    readonly id: string;
    readonly name: string;
    readonly removed: boolean;
  }[];
  readonly seasons: readonly { readonly id: string; readonly name: string }[];
  readonly assignments: readonly { readonly gameId: string; readonly accountId: string }[];
};

export async function listGameNames(scope: LeagueScope): Promise<GameNamesRows> {
  const tx = transactionOf(scope);
  const teams = await tx
    .selectFrom('teams')
    .select(['id', 'name', 'deleted_at'])
    .where('league_id', '=', scope.leagueId)
    .orderBy('id')
    .execute();
  const seasons = await tx
    .selectFrom('seasons')
    .select(['id', 'name'])
    .where('league_id', '=', scope.leagueId)
    .orderBy('id')
    .execute();
  const assignments = await tx
    .selectFrom('game_assignments')
    .select(['game_id', 'account_id'])
    .where('league_id', '=', scope.leagueId)
    // In the order they were made, so a game's scorekeepers are listed as they were added.
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return {
    teams: teams.map((row) => ({ id: row.id, name: row.name, removed: row.deleted_at !== null })),
    seasons: seasons.map((row) => ({ id: row.id, name: row.name })),
    assignments: assignments.map((row) => ({ gameId: row.game_id, accountId: row.account_id })),
  };
}
