// Starts a season's schedule draft in the scope's league: its id and version (1), 'exists' if
// the season already has one (one draft per season), or 'no-season' if the season is not in
// the scope's league. Nothing is raised for either, so the transaction stays usable.
import type { DraftDocument } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertScheduleDraft(
  scope: LeagueScope,
  seasonId: string,
  changes: DraftDocument,
  basedOnRevision: number | null,
): Promise<{ id: string; version: number } | 'exists' | 'no-season'> {
  const trx = transactionOf(scope);
  const inserted = await sql<{ id: string; version: number }>`
    insert into schedule_drafts (league_id, season_id, changes, based_on_revision)
    select s.league_id, s.id, ${JSON.stringify(changes)}::jsonb, ${basedOnRevision}::integer
    from seasons s
    where s.league_id = ${scope.leagueId} and s.id = ${seasonId} and s.deleted_at is null
    on conflict on constraint schedule_drafts_one_per_season do nothing
    returning id, version`.execute(trx);
  const row = inserted.rows[0];
  if (row !== undefined) return { id: row.id, version: row.version };
  const season = await trx
    .selectFrom('seasons')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return season === undefined ? 'no-season' : 'exists';
}
