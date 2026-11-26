// The start-up guard reads the league fence itself (step 2.238), on a real PostgreSQL.
// checkLoginRole, which the website, the worker and the league-making tool run at start,
// must refuse each of the four ways past the fence that lie outside who holds the key:
// (a) a league table whose row-level security is off or not forced, (b) a policy wider
// than a league, (c) a security-definer function the login may run that is not reviewed,
// (d) a table no migration made. Each is planted by the tables' owner, refused with its
// sentence, put right by the very statement the sentence ends with, and removed whatever
// happens; the guard passes again after each.
//
// What the login itself sees is read AS app_login (no `set role`), not only as app_user:
// a wide plant is shown to be real by the login seeing both leagues' rows.
import { checkLoginRole, connectPostgresDriver, type PostgresDriver } from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rule } from '../../packages/database/src/db/fence-catalog.ts';
import { migrationCatalog } from '../../packages/database/src/db/migration-catalog.ts';
import { appDatabase, ca, fresh, makeMadeUpLeague, ownerSession, server } from './server.ts';

const db = appDatabase(1);
let owner: PostgresDriver;
let a: string;
let b: string;
beforeAll(async () => {
  a = await makeMadeUpLeague(`alpha-${fresh()}`);
  b = await makeMadeUpLeague(`bravo-${fresh()}`);
  owner = await ownerSession();
});
afterAll(async () => {
  await owner.close();
  await db.close();
});

/** The statement a sentence ends with, without the words around it. */
const statementOf = (problem: string) =>
  problem
    .slice(problem.lastIndexOf(': ') + 2)
    .replace(/ \(or make it in a migration\)$/, '')
    .replace(/, then make it again as its migration does$/, '');

/**
 * Plants `plant` as the owner, expects the guard to say exactly `said`, runs `whilePlanted`,
 * runs each sentence's own statement and expects the guard to pass; `undo` runs whatever
 * happens, and the guard passes after it too.
 */
async function plantedAndMended(
  plant: readonly string[],
  said: readonly string[],
  undo: readonly string[],
  whilePlanted: () => Promise<void> = async () => {},
) {
  try {
    for (const statement of plant) await owner.exec(statement);
    expect(await checkLoginRole(db)).toEqual(said);
    await whilePlanted();
    for (const problem of said) await owner.exec(statementOf(problem));
    expect(await checkLoginRole(db)).toEqual([]);
  } finally {
    for (const statement of undo) await owner.exec(statement);
  }
  expect(await checkLoginRole(db)).toEqual([]);
}

/** Runs `read` on a connection AS app_login itself, in a transaction with `league` set. */
async function asLogin<T>(
  league: string | null,
  read: (login: PostgresDriver) => Promise<T>,
): Promise<T> {
  const login = await connectPostgresDriver(server.appUrl, { ca });
  try {
    await login.exec('begin');
    if (league !== null)
      await login.query(`select pg_catalog.set_config('app.league_id', $1, true)`, [league]);
    const { rows } = await login.query<{ me: string }>('select current_user::text as me');
    expect(rows[0]?.me).toBe('app_login');
    return await read(login);
  } finally {
    await login.exec('rollback');
    await login.close();
  }
}

/** Which of the two made-up leagues the login sees rows of in `table` (by `column`). */
async function leaguesSeen(login: PostgresDriver, table: string, column = 'league_id') {
  const { rows } = await login.query<{ league: string }>(
    `select distinct ${column}::text as league from ${table}
     where ${column} = any($1::uuid[]) order by 1`,
    [[a, b]],
  );
  return rows.map((row) => row.league);
}

const both = () => [a, b].sort();

describe('with nothing planted', () => {
  it('the guard passes for app_login', async () => {
    expect(await checkLoginRole(db)).toEqual([]);
  });

  it('every policy on a league table reads as the migrations’ own on this server', async () => {
    // migration-catalog.ts is generated on PGlite (PostgreSQL 17); this server is 16. Each
    // rule is compared as the guard compares it (T-470: `public.` and spacing not counted).
    const { rows: version } = await owner.query<{ v: string }>(
      `select current_setting('server_version_num') as v`,
    );
    expect(Number(version[0]?.v)).toBeLessThan(170000);
    const { rows } = await owner.query<{
      table: string;
      name: string;
      using: string | null;
      check: string | null;
    }>(
      `select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
           as "table",
         p.polname::text as name, pg_catalog.pg_get_expr(p.polqual, p.polrelid) as "using",
         pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as "check"
       from pg_catalog.pg_policy p
       join pg_catalog.pg_class c on c.oid = p.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace`,
    );
    const here = new Map(rows.map((row) => [`${row.table} ${row.name}`, row]));
    expect(migrationCatalog.policies.length).toBeGreaterThan(20);
    for (const made of migrationCatalog.policies) {
      const found = here.get(`${made.table} ${made.name}`);
      expect({
        policy: `${made.name} on ${made.table}`,
        using: rule(found?.using ?? null),
      }).toEqual({ policy: `${made.name} on ${made.table}`, using: made.using });
      expect(rule(found?.check ?? null)).toBe(made.check);
    }
  });

  it('every column that points at the leagues is named league_id, so the guard sees it', async () => {
    const { rows } = await owner.query<{ table: string; column: string }>(
      `select k.conrelid::regclass::text as "table", a.attname::text as "column"
       from pg_catalog.pg_constraint k
       join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
       where k.contype = 'f' and k.confrelid = 'public.leagues'::regclass
       order by 1, 2`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((row) => row.column !== 'league_id')).toEqual([]);
  });

  it('as app_login itself, sees only its own league’s rows through every league table', async () => {
    const { rows: tables } = await owner.query<{ table: string; column: string }>(
      `select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
           as "table",
         case when c.oid = 'public.leagues'::regclass then 'id' else 'league_id' end as "column"
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
         and (c.oid = 'public.leagues'::regclass or exists (
           select 1 from pg_catalog.pg_attribute a
           where a.attrelid = c.oid and a.attname = 'league_id' and not a.attisdropped))
         and pg_catalog.has_schema_privilege('app_login', n.oid, 'usage')
         and pg_catalog.has_table_privilege('app_login', c.oid, 'select')
       order by 1`,
    );
    // Filled: the tables in which the owner (past the fence) sees rows of both leagues.
    const filled: string[] = [];
    for (const { table, column } of tables)
      if ((await leaguesSeen(owner, table, column)).length === 2) filled.push(table);
    expect(filled).toEqual(expect.arrayContaining(['public.leagues', 'public.programs']));
    for (const [league, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const seen = await asLogin(league, async (login) => {
        const out: { table: string; leagues: string[] }[] = [];
        for (const { table, column } of tables)
          out.push({ table, leagues: await leaguesSeen(login, table, column) });
        return out;
      });
      for (const { table, leagues } of seen) {
        expect({ table, leagues }).toEqual({
          table,
          leagues: filled.includes(table) ? [league] : leagues.filter((l) => l === league),
        });
        expect(leagues).not.toContain(other);
      }
    }
    const none = await asLogin(null, (login) => leaguesSeen(login, 'public.leagues', 'id'));
    expect(none).toEqual([]);
  });
});

describe('(a) a league table whose row-level security is not on and forced', () => {
  it('on but not forced: refused, naming it', async () => {
    await plantedAndMended(
      ['alter table public.programs no force row level security'],
      [
        'public.programs has a league column but its row-level security is on but not forced, so its owner sees every league: alter table public.programs force row level security',
      ],
      ['alter table public.programs enable row level security, force row level security'],
    );
  });

  it('off: refused, naming it, and the login itself then sees both leagues', async () => {
    await plantedAndMended(
      ['alter table public.programs disable row level security'],
      [
        'public.programs has a league column but its row-level security is off, so every role that may read it sees every league: alter table public.programs enable row level security',
      ],
      ['alter table public.programs enable row level security, force row level security'],
      async () => {
        expect(await asLogin(a, (login) => leaguesSeen(login, 'public.programs'))).toEqual(both());
      },
    );
  });

  it('a league table in a schema no migration made: refused, naming it', async () => {
    const schema = `p_sch_${fresh()}`;
    await plantedAndMended(
      [`create schema ${schema}`, `create table ${schema}.kept (id int, league_id uuid)`],
      [
        `${schema}.kept has a league column but its row-level security is off, so every role that may read it sees every league: alter table ${schema}.kept enable row level security, force row level security`,
      ],
      [`drop schema if exists ${schema} cascade`],
    );
  });

  it('a league table a new migration adds without a forced fence: refused, naming it', async () => {
    const table = `public.p_new_${fresh()}`;
    await plantedAndMended(
      [`create table ${table} (id int, league_id uuid references public.leagues (id))`],
      [
        `${table} has a league column but its row-level security is off, so every role that may read it sees every league: alter table ${table} enable row level security, force row level security`,
        `${table} is a table that no migration made, so nothing has checked its fence: drop table ${table} (or make it in a migration)`,
      ],
      [`drop table if exists ${table}`],
    );
  });
});

describe('(b) a policy wider than a league', () => {
  it('using (true): refused by name, and the login itself sees both leagues meanwhile', async () => {
    const policy = `p_wide_${fresh()}`;
    expect(await asLogin(null, (login) => leaguesSeen(login, 'public.programs'))).toEqual([]);
    await plantedAndMended(
      [`create policy ${policy} on public.programs using (true)`],
      [
        `public.programs has a policy ${policy} that no migration made, so its rule (to public using (true)) is not known to name the league: drop policy ${policy} on public.programs`,
      ],
      [`drop policy if exists ${policy} on public.programs`],
      async () => {
        expect(await asLogin(null, (login) => leaguesSeen(login, 'public.programs'))).toEqual(
          both(),
        );
      },
    );
    expect(await asLogin(null, (login) => leaguesSeen(login, 'public.programs'))).toEqual([]);
  });

  it('a role with SELECT and such a policy, which the login inherits: refused by name', async () => {
    const role = `p_rd_${fresh()}`;
    const policy = `${role}_all`;
    await plantedAndMended(
      [
        `create role ${role} nologin`,
        `grant select on public.leagues to ${role}`,
        `create policy ${policy} on public.leagues for select to ${role} using (true)`,
        `grant ${role} to app_login`,
      ],
      [
        `public.leagues has a policy ${policy} that no migration made, so its rule (to ${role} using (true)) is not known to name the league: drop policy ${policy} on public.leagues`,
      ],
      [
        `drop policy if exists ${policy} on public.leagues`,
        `do $$ begin
           if exists (select 1 from pg_catalog.pg_roles where rolname = '${role}') then
             revoke select on public.leagues from ${role};
             drop role ${role};
           end if;
         end $$`,
      ],
      async () => {
        expect(await asLogin(null, (login) => leaguesSeen(login, 'public.leagues', 'id'))).toEqual(
          both(),
        );
      },
    );
  });

  it('a migration’s policy changed by hand: refused, and its own statement restores it', async () => {
    const made = migrationCatalog.policies.find(
      (policy) => policy.table === 'public.programs' && policy.permissive,
    );
    if (made === undefined) throw new Error('No policy of the migrations on public.programs.');
    const text = (using: string | null, check: string | null) =>
      `to ${made.roles}` +
      (using === null ? '' : ` using (${using})`) +
      (check === null ? '' : ` with check (${check})`);
    const name = `${made.name} on public.programs`;
    await plantedAndMended(
      [`alter policy ${name} using (true)`],
      [
        `public.programs has its policy ${made.name} changed from the migrations' (now ${text('true', made.check)}): alter policy ${name} ${text(made.using, made.check)}`,
      ],
      [`alter policy ${name} ${text(made.using, made.check)}`],
      async () => {
        expect(await asLogin(null, (login) => leaguesSeen(login, 'public.programs'))).toEqual(
          both(),
        );
      },
    );
  });
});

describe('(c) a security-definer function the login may run, outside public', () => {
  it('granted to app_user, or only to a role the login may become: each refused', async () => {
    const word = fresh();
    const schema = `p_fn_${word}`;
    const helper = `p_hlp_${word}`;
    const peek = (name: string) =>
      `create function ${schema}.${name}() returns bigint language sql security definer
       set search_path = pg_catalog as 'select count(*) from public.programs'`;
    await plantedAndMended(
      [
        `create schema ${schema}`,
        `grant usage on schema ${schema} to app_user`,
        peek('peek'),
        `revoke execute on function ${schema}.peek() from public`,
        `grant execute on function ${schema}.peek() to app_user`,
        peek('peek_more'),
        `revoke execute on function ${schema}.peek_more() from public`,
        `create role ${helper} nologin`,
        `grant execute on function ${schema}.peek_more() to ${helper}`,
        `grant ${helper} to app_login with inherit false, set true`,
      ],
      [
        `app_login may run ${schema}.peek(), a security-definer function that is not on the reviewed list, so it may read past the league fence: revoke execute on function ${schema}.peek() from app_user`,
        `app_login may become ${helper}, which may run ${schema}.peek_more(), a security-definer function that is not on the reviewed list, so it may read past the league fence: revoke execute on function ${schema}.peek_more() from ${helper}`,
      ],
      [`drop schema if exists ${schema} cascade`, `drop role if exists ${helper}`],
      async () => {
        // The plant is real: through it the login counts rows its own query cannot see.
        const counts = await asLogin(null, async (login) => {
          const { rows } = await login.query<{ through: string; direct: string }>(
            `select ${schema}.peek()::text as through,
               (select count(*) from public.programs)::text as direct`,
          );
          return rows[0];
        });
        expect(Number(counts?.direct)).toBe(0);
        expect(Number(counts?.through)).toBeGreaterThanOrEqual(2);
      },
    );
  });
});

describe('(d) a table or view no migration made', () => {
  it('in public and in platform: each refused by name', async () => {
    const word = fresh();
    await plantedAndMended(
      [
        `create table public.p_tbl_${word} (id int)`,
        `create view platform.p_view_${word} as select 1 as one`,
      ],
      [
        `platform.p_view_${word} is a view that no migration made, so nothing has checked its fence: drop view platform.p_view_${word} (or make it in a migration)`,
        `public.p_tbl_${word} is a table that no migration made, so nothing has checked its fence: drop table public.p_tbl_${word} (or make it in a migration)`,
      ],
      [`drop view if exists platform.p_view_${word}`, `drop table if exists public.p_tbl_${word}`],
    );
  });
});
