// The scope's league's activity log, newest first, at most `limit` entries, older
// than `before` when given (A-6).
import type { ActivityCursor, ActivityRecord } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

type Detail = string | number | boolean | null;

const isDetail = (value: unknown): value is Detail =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** Only flat values are written (insertActivity); anything else is left out. */
function detailsOf(value: unknown): Record<string, Detail> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, Detail> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isDetail(inner)) out[key] = inner;
  }
  return out;
}

export async function listActivityEntries(
  scope: LeagueScope,
  limit: number,
  before: ActivityCursor | undefined,
): Promise<ActivityRecord[]> {
  let query = transactionOf(scope)
    .selectFrom('activity_log')
    .select([
      'id',
      'actor_account_id',
      'action',
      'target_type',
      'target_id',
      'summary',
      'details',
      'at',
    ])
    .where('league_id', '=', scope.leagueId);
  if (before !== undefined) {
    query = query.where(sql<boolean>`(at, id) < (${before.at}::timestamptz, ${before.id}::uuid)`);
  }
  const rows = await query.orderBy('at', 'desc').orderBy('id', 'desc').limit(limit).execute();
  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    actorAccountId: row.actor_account_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    details: detailsOf(row.details),
  }));
}
