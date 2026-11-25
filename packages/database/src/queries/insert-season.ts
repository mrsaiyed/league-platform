// Adds a season in the state draft to a program of the scope's league. The season's
// short name is unique within its program (0003): a repeat comes back as 'slug-taken',
// and the transaction is then unusable: the caller rolls it back.
// Its rules, when given, are saved in the same statement (T-430); left out, the
// column's starting document stays.
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewSeasonRow = {
  programId: string;
  slug: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  rules?: JsonObject;
};

/** The new season's id, or 'slug-taken'. */
export async function insertSeason(
  scope: LeagueScope,
  season: NewSeasonRow,
): Promise<string | 'slug-taken'> {
  try {
    const row = await transactionOf(scope)
      .insertInto('seasons')
      .values({
        league_id: scope.leagueId,
        program_id: season.programId,
        slug: season.slug,
        name: season.name,
        starts_on: season.startsOn,
        ends_on: season.endsOn,
        ...(season.rules === undefined ? {} : { rules: season.rules }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'seasons_slug_key') return 'slug-taken';
    throw error;
  }
}
