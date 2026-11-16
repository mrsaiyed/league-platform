// Every season of the scope's league that staff may be told of (step 2.93 part 4: the
// schedule admin's and Season settings' list of seasons, apps/web's scheduleAdmin.seasonsOf):
// the ones visitors can see (running and finished) first, in the order the public pages
// list them, then the ones not public yet (being set up), by name. A season in the bin,
// or of a program in the bin, is not listed. Each row says its program, so the caller can
// apply the scheduling module's rule of who may be told of a season not public yet
// (`mayListSeason`): this query lists them all and decides nothing about who asks.
// Built field by field (T-29).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type LeagueSeasonRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly programId: string;
  readonly isCurrent: boolean;
  /** Running or finished: visitors can see it (P2 §4). */
  readonly isPublic: boolean;
};

export async function listLeagueSeasons(scope: LeagueScope): Promise<LeagueSeasonRow[]> {
  const rows = await transactionOf(scope)
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
      'seasons.program_id as program_id',
      'seasons.is_current as is_current',
      sql<boolean>`seasons.status in ('active', 'completed')`.as('is_public'),
    ])
    .where('seasons.league_id', '=', scope.leagueId)
    .where('seasons.deleted_at', 'is', null)
    .where('programs.deleted_at', 'is', null)
    // The public ones first, newest first as listPublicSeasons lists them; then the rest.
    .orderBy(sql`case when seasons.status in ('active', 'completed') then 0 else 1 end`)
    .orderBy(
      sql`case when seasons.status in ('active', 'completed') then seasons.starts_on end desc nulls last`,
    )
    .orderBy('seasons.name')
    .orderBy('seasons.id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    programId: row.program_id,
    isCurrent: row.is_current,
    isPublic: row.is_public,
  }));
}
