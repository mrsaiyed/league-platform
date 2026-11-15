// What the tool that removes a league made by mistake (step 2.150, record 063) reads
// as the migration login, outside any league's fence: the league as the plan shows
// it, why it may not be removed (league_removal_problems, 0017), what is left of it
// afterwards (league_rows), and the platform log's entry about it.
import type { LeagueRemovalFinding } from '@srleagues/core';
import type { SqlSession } from '../migrations/index.ts';

const plainFindings = [
  'in-bin',
  'league-changed',
  'program-changed',
  'season-changed',
  'activity',
] as const;
const isPlainFinding = (word: string): word is (typeof plainFindings)[number] =>
  (plainFindings as readonly string[]).includes(word);

/**
 * One of league_removal_problems' words as a finding: `state:live`, `in-bin`,
 * `rows:public.games:3` and the rest. A word this code does not know is kept as
 * rows of an unknown table, so it is still refused and still shown.
 */
export function findingOf(word: string): LeagueRemovalFinding {
  if (word.startsWith('state:')) return { kind: 'state', state: word.slice('state:'.length) };
  if (isPlainFinding(word)) return { kind: word };
  const rows = /^rows:([a-z0-9_.]+):(\d+)$/.exec(word);
  if (rows !== null) return { kind: 'rows', table: rows[1] ?? '', count: Number(rows[2]) };
  return { kind: 'rows', table: word, count: 1 };
}

/** The league to remove, as the plan shows it, read before anything is changed. */
export type LeagueToRemove = {
  readonly leagueId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly city: string | null;
  readonly madeOn: string;
  readonly seasons: readonly string[];
  readonly ownerAccountId: string;
  readonly ownerEmail: string;
  /** Who the activity log says made it (its `leagues.create` entry), if anyone. */
  readonly madeByEmail: string | null;
  /** Why it may not be removed; empty when it is exactly what the maker writes. */
  readonly problems: readonly LeagueRemovalFinding[];
};

/** The league with this id as the plan shows it, or undefined when there is none. */
export async function leagueToRemove(
  session: SqlSession,
  leagueId: string,
): Promise<LeagueToRemove | undefined> {
  const { rows } = await session.query<{
    id: string;
    slug: string;
    name: string;
    status: string;
    city: string | null;
    made_on: string;
    owner_account_id: string;
    owner_email: string;
    made_by_email: string | null;
    problems: string[];
  }>(
    `select l.id, l.slug, l.name, l.status, l.city, to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD') as made_on,
            l.owner_account_id, o.email as owner_email,
            (select a.email from public.activity_log g
               join public.accounts a on a.id = g.actor_account_id
             where g.league_id = l.id and g.action = 'leagues.create'
             order by g.at limit 1) as made_by_email,
            public.league_removal_problems(l.id) as problems
     from public.leagues l join public.accounts o on o.id = l.owner_account_id
     where l.id = $1`,
    [leagueId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const seasons = await session.query<{ name: string }>(
    'select name from public.seasons where league_id = $1 order by created_at, id',
    [leagueId],
  );
  return {
    leagueId: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    city: row.city,
    madeOn: row.made_on,
    seasons: seasons.rows.map((s) => s.name),
    ownerAccountId: row.owner_account_id,
    ownerEmail: row.owner_email,
    madeByEmail: row.made_by_email,
    problems: row.problems.map(findingOf),
  };
}

/** How many rows of the league are left in every league table, all together. */
export async function leagueRowsLeft(session: SqlSession, leagueId: string): Promise<number> {
  const { rows } = await session.query<{ n: string | number }>(
    `select coalesce(sum(row_count), 0) + (select count(*) from public.leagues where id = $1) as n
     from public.league_rows($1)`,
    [leagueId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** The platform log's entry, read back: what it says and whom it names. */
export type PlatformLogEntry = {
  readonly action: string;
  readonly leagueId: string;
  readonly slug: string;
  readonly name: string;
  readonly actorEmail: string | null;
};

export async function platformLogEntry(
  session: SqlSession,
  entryId: string,
): Promise<PlatformLogEntry | undefined> {
  const { rows } = await session.query<{
    action: string;
    removed_league_id: string;
    league_slug: string;
    league_name: string;
    email: string | null;
  }>(
    `select p.action, p.removed_league_id, p.league_slug, p.league_name, a.email
     from platform.activity_log p left join public.accounts a on a.id = p.actor_account_id
     where p.id = $1`,
    [entryId],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : {
        action: row.action,
        leagueId: row.removed_league_id,
        slug: row.league_slug,
        name: row.league_name,
        actorEmail: row.email,
      };
}

/** Whether the league's row is still there. */
export async function leagueStillThere(session: SqlSession, leagueId: string): Promise<boolean> {
  const { rows } = await session.query<{ there: boolean }>(
    'select exists (select 1 from public.leagues where id = $1) as there',
    [leagueId],
  );
  return rows[0]?.there === true;
}
