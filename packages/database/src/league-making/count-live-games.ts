// How many games are being scored right now, in every league (step 2.95, T-158): the
// release command asks this before it applies anything, and refuses above a small number
// unless the person says to go ahead. It reads one number only: no league, no game, no
// person. A database that has no games table yet (a new copy, before its first release)
// has none live.
//
// The count is right only for a login that sees past every league's fence: `games` has
// FORCE row-level security (migration 0009), so a fenced login would see no row and count
// 0 while games are live. So it first proves the login sees every league (a superuser, or
// a role with BYPASSRLS, as require_view_of_every_league() asks, migration 0005), and
// refuses to count otherwise: never a 0 it cannot vouch for.
import type { SqlSession } from '../migrations/index.ts';

export type LiveGamesCount =
  | { readonly ok: true; readonly live: number }
  /** The login is fenced by row-level security: it cannot see every league's games. */
  | { readonly ok: false; readonly problem: 'fenced-login' };

export async function countLiveGames(session: SqlSession): Promise<LiveGamesCount> {
  const role = await session.query<{ sees: boolean }>(
    `select exists (
       select 1 from pg_catalog.pg_roles
       where rolname = current_user and (rolsuper or rolbypassrls)
     ) as sees`,
  );
  if (role.rows[0]?.sees !== true) return { ok: false, problem: 'fenced-login' };
  const table = await session.query<{ present: boolean }>(
    `select to_regclass('public.games') is not null as present`,
  );
  if (table.rows[0]?.present !== true) return { ok: true, live: 0 };
  const { rows } = await session.query<{ live: number }>(
    `select count(*)::int as live from public.games where status = 'live'`,
  );
  return { ok: true, live: rows[0]?.live ?? 0 };
}
