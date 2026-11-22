// How many games are being scored right now, in every league (step 2.95, T-158): the
// release command asks this before it applies anything, and refuses above a small number
// unless the person says to go ahead. It runs as the migration login, which sees past the
// league fence, and reads one number only: no league, no game, no person. A database
// that has no games table yet (a new copy, before its first release) has none live.
import type { SqlSession } from '../migrations/index.ts';

export async function countLiveGames(session: SqlSession): Promise<number> {
  const table = await session.query<{ present: boolean }>(
    `select to_regclass('public.games') is not null as present`,
  );
  if (table.rows[0]?.present !== true) return 0;
  const { rows } = await session.query<{ live: number }>(
    `select count(*)::int as live from public.games where status = 'live'`,
  );
  return rows[0]?.live ?? 0;
}
