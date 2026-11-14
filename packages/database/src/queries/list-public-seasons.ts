// The seasons a visitor can pick from (P2 §4, `?season=`): running and finished ones,
// newest first. A season still being set up, or in the bin, is not offered. Built
// field by field for the season picker (T-29).
import { sql } from 'kysely';
import type { PublicSeasonChoice } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listPublicSeasons(scope: LeagueScope): Promise<PublicSeasonChoice[]> {
  const rows = await transactionOf(scope)
    .selectFrom('seasons')
    .innerJoin('programs', (join) =>
      join
        .onRef('programs.league_id', '=', 'seasons.league_id')
        .onRef('programs.id', '=', 'seasons.program_id'),
    )
    .select([
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
    .where('programs.deleted_at', 'is', null)
    .orderBy(sql`seasons.starts_on desc nulls last`)
    .orderBy('seasons.name')
    .orderBy('seasons.id')
    .execute();
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    programSlug: row.program_slug,
    status: row.status === 'completed' ? 'completed' : 'active',
    isCurrent: row.is_current,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  }));
}
