// The season a public page shows (P2 §4): the one with this id, the one `?season=` names, or, with none, the
// current season of the program (the league's default program unless one is given).
// Only running and finished seasons count; one still being set up is not there at all.
import { sql } from 'kysely';
import type { PublicSeasonChoice } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The season as the pages show it, with the id the other public queries take. */
export type FoundPublicSeason = PublicSeasonChoice & { readonly id: string };

export async function findPublicSeason(
  scope: LeagueScope,
  which: { seasonId?: string; seasonSlug?: string; programSlug?: string } = {},
): Promise<FoundPublicSeason | undefined> {
  let query = transactionOf(scope)
    .selectFrom('seasons')
    .innerJoin('programs', (join) =>
      join
        .onRef('programs.league_id', '=', 'seasons.league_id')
        .onRef('programs.id', '=', 'seasons.program_id'),
    )
    .select([
      'seasons.id as id',
      'seasons.slug as slug',
      'seasons.name as name',
      'programs.slug as program_slug',
      'seasons.status as status',
      'seasons.is_current as is_current',
      sql<string | null>`to_char(seasons.starts_on, 'YYYY-MM-DD')`.as('starts_on'),
      sql<string | null>`to_char(seasons.ends_on, 'YYYY-MM-DD')`.as('ends_on'),
    ])
    .where('seasons.league_id', '=', scope.leagueId)
    .where('seasons.deleted_at', 'is', null)
    .where('seasons.status', 'in', ['active', 'completed'])
    .where('programs.deleted_at', 'is', null);
  if (which.seasonId !== undefined) {
    query = query.where('seasons.id', '=', which.seasonId);
  } else {
    if (which.programSlug !== undefined)
      query = query.where('programs.slug', '=', which.programSlug);
    else query = query.where('programs.is_default', '=', true);
    query =
      which.seasonSlug === undefined
        ? query.where('seasons.is_current', '=', true)
        : query.where('seasons.slug', '=', which.seasonSlug);
  }
  const row = await query.orderBy('seasons.id').executeTakeFirst();
  if (row === undefined) return undefined;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    programSlug: row.program_slug,
    status: row.status === 'completed' ? 'completed' : 'active',
    isCurrent: row.is_current,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}
