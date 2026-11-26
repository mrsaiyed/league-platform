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
  mend: readonly string[] | null = null,
) {
  let failure: unknown = null;
  try {
    for (const statement of plant) await owner.exec(statement);
    expect(await checkLoginRole(db)).toEqual(said);
    await whilePlanted();
    for (const statement of mend ?? said.map(statementOf)) await owner.exec(statement);
    expect(await checkLoginRole(db)).toEqual([]);
  } catch (error) {
    failure = error;
  }
  // Every undo runs; one that fails does not hide the first failure, which is thrown.
  const undone = await undoAll(undo);
  if (failure !== null) throw withUndoFailures(failure, undone);
  if (undone.length > 0) throw new Error(`the undo failed: ${undone.join('; ')}`);
  expect(await checkLoginRole(db)).toEqual([]);
}

/** Runs each undo statement, whatever the one before did; says each that failed. */
async function undoAll(undo: readonly string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const statement of undo) {
    try {
      await owner.exec(statement);
    } catch (error) {
      failed.push(`${statement}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failed;
}

/** The first failure, with the undo statements that failed after it said too. */
function withUndoFailures(failure: unknown, undone: readonly string[]): unknown {
  if (undone.length > 0 && failure instanceof Error)
    failure.message += `\n(and the undo failed: ${undone.join('; ')})`;
  return failure;
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

const fence = '(league_id = ( SELECT current_league_id() AS current_league_id))';

describe('(a) a listed league table whose league column was renamed (T-470, changed)', () => {
  it('renamed, then using (true): refused by name; put back, it passes', async () => {
    const renamed = fence.replace('league_id', 'lg');
    await plantedAndMended(
      [
        'alter table public.activity_log rename column league_id to lg',
        'create policy p_wide on public.activity_log for select using (true)',
      ],
      [
        'public.activity_log is a league table the migrations made, but its league column league_id is now named lg, so its fence cannot be read: alter table public.activity_log rename column lg to league_id',
        `public.activity_log has its policy activity_log_league_fence changed from the migrations' (now to public using (${renamed}) with check (${renamed})): alter policy activity_log_league_fence on public.activity_log to public using (${fence}) with check (${fence})`,
        'public.activity_log has a policy p_wide that no migration made, so its rule (to public using (true)) is not known to name the league: drop policy p_wide on public.activity_log',
      ],
      [
        'drop policy if exists p_wide on public.activity_log',
        `do $$ begin
           if exists (select 1 from pg_catalog.pg_attribute
             where attrelid = 'public.activity_log'::regclass and attname = 'lg')
           then alter table public.activity_log rename column lg to league_id; end if; end $$`,
      ],
    );
  });
});

describe('(d) what no migration made, in a schema no migration made (T-476)', () => {
  it('a view and a materialized view the login reads directly: each refused', async () => {
    const schema = `p_copy_${fresh()}`;
    await plantedAndMended(
      [
        `create schema ${schema}`,
        `create view ${schema}.every_program as select * from public.programs`,
        `create materialized view ${schema}.kept_programs as select * from public.programs`,
        `grant usage on schema ${schema} to app_login`,
        `grant select on ${schema}.every_program, ${schema}.kept_programs to app_login`,
      ],
      [
        `${schema}.every_program is a view that no migration made, and app_login may read it, so nothing has checked its fence: revoke select on table ${schema}.every_program from app_login`,
        `${schema}.kept_programs is a materialized view that no migration made, and app_login may read it, so nothing has checked its fence: revoke select on table ${schema}.kept_programs from app_login`,
      ],
      [`drop schema if exists ${schema} cascade`],
      async () => {
        // The view runs as its owner, past the fence: the login sees both leagues through it.
        expect(await asLogin(a, (login) => leaguesSeen(login, `${schema}.every_program`))).toEqual(
          both(),
        );
      },
    );
  });

  it('a copy without a league column, read through a role the login may become: refused', async () => {
    const word = fresh();
    const schema = `p_copy_${word}`;
    const role = `p_cpr_${word}`;
    await plantedAndMended(
      [
        `create schema ${schema}`,
        `create table ${schema}.program_names as select league_id as lg, name from public.programs`,
        `create role ${role} nologin`,
        `grant usage on schema ${schema} to ${role}`,
        `grant select on ${schema}.program_names to ${role}`,
        `grant ${role} to app_login with inherit false, set true`,
      ],
      [
        `${schema}.program_names is a table that no migration made, and app_login may become ${role}, which may read it, so nothing has checked its fence: revoke select on table ${schema}.program_names from ${role}`,
      ],
      [`drop schema if exists ${schema} cascade`, `drop role if exists ${role}`],
    );
  });

  it('one the login cannot read is let be', async () => {
    const word = fresh();
    const schema = `p_copy_${word}`;
    const role = `p_far_${word}`;
    try {
      for (const statement of [
        `create schema ${schema}`,
        `create view ${schema}.every_program as select * from public.programs`,
        `grant select on ${schema}.every_program to app_login`,
        `create role ${role} nologin`,
        `grant usage on schema ${schema} to ${role}`,
      ])
        await owner.exec(statement);
      // SELECT without the schema's use; the use held by a role the login does not reach.
      expect(await checkLoginRole(db)).toEqual([]);
    } finally {
      const undone = await undoAll([
        `drop schema if exists ${schema} cascade`,
        `drop role if exists ${role}`,
      ]);
      if (undone.length > 0) throw new Error(`the undo failed: ${undone.join('; ')}`);
    }
  });
});

describe('(c) a reviewed security-definer function changed by hand (T-477)', () => {
  it('its body, its settings or its owner: each refused by name', async () => {
    const signature = 'public.find_league_by_slug(text)';
    const { rows } = await owner.query<{ d: string }>(
      `select pg_catalog.pg_get_functiondef('${signature}'::regprocedure) as d`,
    );
    const original = rows[0]?.d ?? '';
    // The `where` clauses taken out: the same name now answers every league.
    const widened = original.replace(/AS \$function\$[\s\S]*\$function\$/, (body) =>
      body.replace(/where[\s\S]*?(;|\$function\$)/i, (_whole, end: string) => ` ${end}`),
    );
    expect(widened).not.toBe(original);
    const role = `p_fown_${fresh()}`;
    const said = (part: string) => [
      `public.find_league_by_slug(wanted text) is a reviewed security-definer function whose ${part} changed since the migrations made it, so its review no longer holds: run the migrations' own definition again`,
    ];
    const putBack = [original, `alter function ${signature} owner to postgres`];
    await plantedAndMended(
      [widened],
      said('body'),
      putBack,
      async () => {
        const counts = await asLogin(null, async (login) => {
          const { rows: found } = await login.query<{ n: number }>(
            `select count(*)::int as n from public.find_league_by_slug('no-such-slug')`,
          );
          return found[0]?.n;
        });
        expect(counts).toBeGreaterThanOrEqual(2);
      },
      putBack,
    );
    await plantedAndMended(
      [`alter function ${signature} set search_path = public`],
      said('settings'),
      putBack,
      async () => {},
      putBack,
    );
    await plantedAndMended(
      [
        `create role ${role} nologin`,
        // The tables' owner may make roles but must be granted one to give it a function,
        // and a function's owner needs the use of making things in its schema.
        `grant ${role} to postgres`,
        `grant create on schema public to ${role}`,
        `alter function ${signature} owner to ${role}`,
      ],
      said('owner'),
      [...putBack, `revoke create on schema public from ${role}`, `drop role if exists ${role}`],
      async () => {},
      putBack,
    );
  });
});

/** The real accounts table back from `hidden`, the plant in its place dropped: once only. */
const putAccountsBack = (hidden: string, plant: 'view' | 'table') => `
  do $$ begin
    if pg_catalog.to_regclass('${hidden}.accounts') is not null then
      drop ${plant} public.accounts;
      alter table ${hidden}.accounts set schema public;
    end if;
    drop schema if exists ${hidden};
  end $$`;

describe('(d) a relation the migrations made, replaced by hand (T-481)', () => {
  it('a table moved away and a view of the programs put in its place: refused', async () => {
    // The confirming look's plant: the names matched, and the login read both leagues.
    const hidden = `p_hide_${fresh()}`;
    const putBack = [putAccountsBack(hidden, 'view')];
    await plantedAndMended(
      [
        `create schema ${hidden}`,
        `alter table public.accounts set schema ${hidden}`,
        'create view public.accounts as select * from public.programs',
        'grant select on public.accounts to app_login',
      ],
      [
        "public.accounts is a table the migrations made, but it is now a view, so it may hold rows of any league: drop view public.accounts, then run the migrations' own definition again",
      ],
      putBack,
      async () => {
        expect(await asLogin(a, (login) => leaguesSeen(login, 'public.accounts'))).toEqual(both());
      },
      putBack,
    );
  });

  it('a table replaced by one of the same name another role owns: refused', async () => {
    const hidden = `p_hide_${fresh()}`;
    const role = `p_other_${fresh()}`;
    const putBack = [putAccountsBack(hidden, 'table')];
    await plantedAndMended(
      [
        `create schema ${hidden}`,
        `alter table public.accounts set schema ${hidden}`,
        `create role ${role} nologin`,
        `grant ${role} to postgres`,
        `grant create on schema public to ${role}`,
        'create table public.accounts as select id, league_id as lg, name from public.programs',
        `alter table public.accounts owner to ${role}`,
        'grant select on public.accounts to app_login',
      ],
      [
        `public.accounts is a table the migrations made, but it is now owned by ${role}, not postgres, so it may not be what they made: alter table public.accounts owner to postgres`,
      ],
      [...putBack, `revoke create on schema public from ${role}`, `drop role if exists ${role}`],
      async () => {
        expect(await asLogin(a, (login) => leaguesSeen(login, 'public.accounts', 'lg'))).toEqual(
          both(),
        );
      },
      putBack,
    );
  });
});

describe('(c) the fence’s own functions changed by hand (T-477, widened)', () => {
  const said = (signature: string) => [
    `${signature} is a function the migrations made whose body changed since the migrations made it, so the fence or the command that calls it may no longer hold: run the migrations' own definition again`,
  ];
  async function original(signature: string): Promise<string> {
    const { rows } = await owner.query<{ d: string }>(
      `select pg_catalog.pg_get_functiondef('${signature}'::regprocedure) as d`,
    );
    return rows[0]?.d ?? '';
  }

  it('current_league_id made to name the other league: refused, and the login sees it', async () => {
    const putBack = [await original('public.current_league_id()')];
    await plantedAndMended(
      [
        `create or replace function public.current_league_id() returns uuid language sql
           stable parallel safe set search_path = pg_catalog, pg_temp
           as $$ select '${b}'::uuid $$`,
      ],
      said('public.current_league_id()'),
      putBack,
      async () => {
        // Set to league A, the login reads league B's programs.
        expect(await asLogin(a, (login) => leaguesSeen(login, 'public.programs'))).toEqual([b]);
      },
      putBack,
    );
  });

  it('current_account_id and require_view_of_every_league: each refused by name', async () => {
    for (const [signature, plant] of [
      [
        'public.current_account_id()',
        `create or replace function public.current_account_id() returns uuid language sql
           stable parallel safe set search_path = pg_catalog, pg_temp
           as $$ select '${b}'::uuid $$`,
      ],
      [
        'public.require_view_of_every_league()',
        `create or replace function public.require_view_of_every_league() returns void
           language plpgsql stable set search_path = pg_catalog, pg_temp as $$ begin end $$`,
      ],
    ] as const) {
      const putBack = [await original(signature)];
      await plantedAndMended([plant], said(signature), putBack, async () => {}, putBack);
    }
  });
});

describe('(b) a fence policy the migrations made, dropped', () => {
  it('is named, and the create statement the sentence gives puts it back', async () => {
    const made = migrationCatalog.policies.find(
      (policy) => policy.table === 'public.courts' && policy.name === 'courts_league_fence',
    );
    expect(made).toBeDefined();
    const fence = made?.using ?? '';
    await plantedAndMended(
      ['drop policy courts_league_fence on public.courts'],
      [
        `public.courts is missing its policy courts_league_fence, which the migrations made, so its rows are not fenced as they meant: create policy courts_league_fence on public.courts as permissive for all to public using (${fence}) with check (${made?.check ?? ''})`,
      ],
      [],
    );
  });
});
