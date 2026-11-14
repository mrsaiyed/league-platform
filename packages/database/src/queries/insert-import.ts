// Starts a fixtures import in the scope's league, in `reading`: its id and version (1), or
// 'no-season' if the season is not in the scope's league. Nothing is raised for a missing
// season, so the transaction stays usable.
import { sql } from 'kysely';
import type { NewImport } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertImport(
  scope: LeagueScope,
  value: NewImport,
): Promise<{ id: string; version: number } | 'no-season'> {
  const inserted = await sql<{ id: string; version: number }>`
    insert into imports (league_id, season_id, kind, account_id, file_name, report)
    select s.league_id, s.id, 'fixtures', ${value.accountId}::uuid, ${value.fileName}::text,
      ${JSON.stringify(value.report)}::jsonb
    from seasons s
    where s.league_id = ${scope.leagueId} and s.id = ${value.seasonId} and s.deleted_at is null
    returning id, version`.execute(transactionOf(scope));
  const row = inserted.rows[0];
  return row === undefined ? 'no-season' : { id: row.id, version: row.version };
}
