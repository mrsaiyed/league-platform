// Writes a season's next schedule revision in the scope's league (A-6, A-9): false if the
// number is already taken (another publication got there first), nothing raised so the
// transaction stays usable. Revisions are history, never changed or removed (T-45).
import type { NewScheduleRevision } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertScheduleRevision(
  scope: LeagueScope,
  seasonId: string,
  revision: NewScheduleRevision,
): Promise<boolean> {
  const inserted = await sql<{ id: string }>`
    insert into schedule_revisions (league_id, season_id, number, published_by_account_id, summary)
    select s.league_id, s.id, ${revision.number}::integer, ${revision.publishedByAccountId}::uuid,
      ${JSON.stringify(revision.summary)}::jsonb
    from seasons s
    where s.league_id = ${scope.leagueId} and s.id = ${seasonId} and s.deleted_at is null
    on conflict on constraint schedule_revisions_number_key do nothing
    returning id`.execute(transactionOf(scope));
  return inserted.rows.length === 1;
}
