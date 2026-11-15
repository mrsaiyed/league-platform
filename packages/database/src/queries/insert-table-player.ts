// Adds a player at a game's scorer's table in the scope's league (record 058, S-6,
// S-34): a new person with the id the device made, a number, a name, or both (either
// name may be empty: 0008 allows it), and their entry at the end of the team's roster,
// naming the game and marked for review as the league asks (0010). The database
// checks the rest: the team plays in that game (check_roster_added_at_game) and, where
// the season wants unique numbers, no one on the team wears the number (0008). Run in
// a savepoint (in-savepoint.ts), so a refusal leaves the batch's transaction usable.
import type { NewTablePlayer, TablePlayerRefusal } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';
import { inSavepoint } from './in-savepoint.ts';

export async function insertTablePlayer(
  scope: LeagueScope,
  player: NewTablePlayer,
): Promise<'added' | TablePlayerRefusal> {
  try {
    return await inSavepoint(scope, async () => {
      const tx = transactionOf(scope);
      await tx
        .insertInto('people')
        .values({
          id: player.personId,
          league_id: scope.leagueId,
          first_name: player.firstName,
          last_name: player.lastName,
        })
        .execute();
      await tx
        .insertInto('roster_entries')
        .values({
          league_id: scope.leagueId,
          team_id: player.teamId,
          person_id: player.personId,
          jersey_number: player.jerseyNumber,
          role: 'player',
          added_at_game_id: player.gameId,
          needs_review: player.needsReview,
          sort: sql<number>`(select coalesce(max(r.sort) + 1, 0) from roster_entries r where r.league_id = ${scope.leagueId} and r.team_id = ${player.teamId})`,
        })
        .execute();
      return 'added' as const;
    });
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'roster_entries_unique_jersey') return 'jersey-taken';
    if (constraint === 'people_pkey' || constraint === 'roster_entries_once') return 'id-taken';
    throw error;
  }
}
