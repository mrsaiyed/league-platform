// What the two-league harness reads and removes past the fence. Every public table
// is read, so a new table is covered as soon as it exists. Rows are grouped: a
// league table's rows (and the leagues row) by their league, every other table's
// rows (accounts, profiles, profile_access, ...) under `outside`.
//
// Call these only as the tables' owner or a superuser: after `reset role` inside a
// transaction the app opened, or in an unfenced one.
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/schema-types.ts';
import { normalizedUuid } from '../db/uuid.ts';

/** Group (a league id, or `outside`) → table → its rows as JSON text, sorted. */
export type DatabaseRows = Map<string, Map<string, string[]>>;
export const outside = 'outside';

/** What belongs to one league: the ids and words that give it away, and its rows. */
export type Footprint = {
  traces: string[];
  /** Table → ids of the rows that are this league's, its people's included. */
  rows: Map<string, string[]>;
};

type Trx = Transaction<Database>;

export async function readRows(trx: Trx): Promise<DatabaseRows> {
  const { rows: tables } = await sql<{ name: string; by_league: boolean }>`
    select t.table_name as name, exists (
      select 1 from information_schema.columns c
      where c.table_schema = t.table_schema and c.table_name = t.table_name
        and c.column_name = 'league_id'
    ) as by_league
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by 1`.execute(trx);
  const groups: DatabaseRows = new Map();
  for (const { name, by_league } of tables) {
    const { rows } = await sql<{ row: string }>`
      select to_jsonb(r)::text as row from ${sql.table(name)} r order by 1`.execute(trx);
    for (const { row } of rows) {
      const parsed: Record<string, unknown> = JSON.parse(row);
      const key = name === 'leagues' ? parsed.id : by_league ? parsed.league_id : outside;
      const group = typeof key === 'string' ? key : outside;
      const byTable = groups.get(group) ?? new Map<string, string[]>();
      groups.set(group, byTable.set(name, [...(byTable.get(name) ?? []), row]));
    }
  }
  return groups;
}

/** The tables whose rows in `group` differ between two readings. */
export function changedTables(before: DatabaseRows, after: DatabaseRows, group: string): string[] {
  const was = before.get(group) ?? new Map<string, string[]>();
  const now = after.get(group) ?? new Map<string, string[]>();
  return [...new Set([...was.keys(), ...now.keys()])]
    .filter(
      (table) => JSON.stringify(was.get(table) ?? []) !== JSON.stringify(now.get(table) ?? []),
    )
    .sort();
}

export const uuidPattern = /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi;
/** Every UUID in a text, in lower case. */
export const uuidsIn = (text: string) =>
  [...text.matchAll(uuidPattern)].flatMap(([match]) => normalizedUuid(match) ?? []);

/**
 * Each league's footprint: the ids found in its rows and in no other league's, its
 * marker word, and its rows. A row outside any league is that league's when it
 * names one of those ids (a member's account, then that account's profile access,
 * then the profile), followed until nothing new is found. A row naming ids of two
 * leagues (an account with roles in both) belongs to neither.
 */
export function footprints(rows: DatabaseRows, markers: Map<string, string>) {
  const leagueIds = [...markers.keys()];
  const idsOf = (group: string) =>
    new Set([...(rows.get(group)?.values() ?? [])].flat().flatMap(uuidsIn));
  const own = new Map(leagueIds.map((league) => [league, idsOf(league)]));
  const onlyIn = (league: string, uuid: string) =>
    leagueIds.every((other) => other === league || !own.get(other)?.has(uuid));
  const result = new Map<string, Footprint>();
  for (const league of leagueIds) {
    const ids = new Set([...(own.get(league) ?? [])].filter((uuid) => onlyIn(league, uuid)));
    const outsideTexts = [...(rows.get(outside)?.values() ?? [])].flat();
    for (let grew = true; grew; ) {
      grew = false;
      for (const found of outsideTexts.map(uuidsIn)) {
        if (!found.some((uuid) => ids.has(uuid))) continue;
        if (found.some((uuid) => !onlyIn(league, uuid))) continue;
        for (const uuid of found.filter((uuid) => !ids.has(uuid))) {
          ids.add(uuid);
          grew = true;
        }
      }
    }
    const rowsOfLeague = new Map<string, string[]>();
    for (const [table, texts] of [...(rows.get(league) ?? []), ...(rows.get(outside) ?? [])]) {
      const keep = texts
        .map((text): Record<string, unknown> => JSON.parse(text))
        .filter((row) => typeof row.id === 'string' && ids.has(row.id))
        .map((row) => String(row.id));
      if (keep.length > 0) rowsOfLeague.set(table, [...(rowsOfLeague.get(table) ?? []), ...keep]);
    }
    result.set(league, { traces: [markers.get(league) ?? league, ...ids], rows: rowsOfLeague });
  }
  return result;
}

/**
 * Deletes these rows inside the open transaction, past row-level security and with
 * triggers and foreign keys off, then puts the transaction back as it was: the
 * same role, league and account. Only for a transaction that will be rolled back.
 */
export async function removeRows(trx: Trx, rows: Map<string, string[]>): Promise<void> {
  const { rows: found } = await sql<{
    role: string;
    login: string;
    league: string;
    account: string;
  }>`
    select current_user as role, session_user as login,
      coalesce(current_setting('app.league_id', true), '') as league,
      coalesce(current_setting('app.account_id', true), '') as account`.execute(trx);
  const state = found[0];
  if (state === undefined) throw new Error('removeRows: could not read the transaction state');
  await sql`reset role`.execute(trx);
  await sql`set local session_replication_role = replica`.execute(trx);
  for (const [table, ids] of rows) {
    await sql`delete from ${sql.table(table)} where id::text in (${sql.join(ids)})`.execute(trx);
  }
  await sql`set local session_replication_role = origin`.execute(trx);
  if (state.role !== state.login) await sql`set local role ${sql.id(state.role)}`.execute(trx);
  await sql`select set_config('app.league_id', ${state.league}, true),
                   set_config('app.account_id', ${state.account}, true)`.execute(trx);
}
