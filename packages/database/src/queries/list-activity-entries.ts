// The scope's league's activity log, newest first, at most `limit` entries, older
// than `before` when given (A-6). For a program (club, team), only the entries
// whose details name it: the access entries say which scope they were about. A search
// (step 2.77) keeps one person's entries, one kind of thing's (by command name, as core's
// activityMatchOf says) and a span of time; with `after`, the entries just newer than it.
import type { ActivityCursor, ActivityRecord, ActivitySearch, Scope } from '@srleagues/core';
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
  about: Scope,
  search: ActivitySearch = {},
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
      // To the microsecond, as stored, so a page can carry on exactly after it.
      sql<string>`to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as('at_text'),
    ])
    .where('league_id', '=', scope.leagueId);
  if (about.type !== 'league') {
    query = query
      .where(sql<boolean>`details ->> 'scopeType' = ${about.type}`)
      .where(sql<boolean>`details ->> 'scopeId' = ${about.id}`);
  }
  if (search.actorAccountId !== undefined) {
    query = query.where('actor_account_id', '=', search.actorAccountId);
  }
  const match = search.match;
  if (match !== undefined) {
    query = query.where(
      sql<boolean>`(split_part(action, '.', 1) = any(${[...match.modules]}::text[])
        or action = any(${[...match.also]}::text[]))
        and not action = any(${[...match.except]}::text[])`,
    );
  }
  if (search.from !== undefined) {
    query = query.where(sql<boolean>`at >= ${search.from}::timestamptz`);
  }
  if (search.until !== undefined) {
    query = query.where(sql<boolean>`at < ${search.until}::timestamptz`);
  }
  if (before !== undefined) {
    query = query.where(sql<boolean>`(at, id) < (${before.at}::timestamptz, ${before.id}::uuid)`);
  }
  const after = search.after;
  if (after !== undefined) {
    query = query.where(sql<boolean>`(at, id) > (${after.at}::timestamptz, ${after.id}::uuid)`);
  }
  // Newer than `after`: the nearest ones, read oldest first, then turned newest first.
  const rows =
    after === undefined
      ? await query.orderBy('at', 'desc').orderBy('id', 'desc').limit(limit).execute()
      : (await query.orderBy('at', 'asc').orderBy('id', 'asc').limit(limit).execute()).reverse();
  return rows.map((row) => ({
    id: row.id,
    at: row.at_text,
    actorAccountId: row.actor_account_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    details: detailsOf(row.details),
  }));
}
