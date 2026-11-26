// Step 2.238: the start-up guard reads the league fence itself. Each fault is planted on a
// fresh database, named by checkLoginRole (the one function the website, the worker and
// `npm run test:real-postgres` run) in its sentence, and then put right by running the very
// statement the sentence gives, after which the guard passes again.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkFence } from './check-fence.ts';
import { checkLoginRole, checkWorkerLoginRole } from './check-login-role.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';
import { migrationCatalog } from './migration-catalog.ts';

const login = 'made_up_app_login';
const fence = '(league_id = ( SELECT public.current_league_id() AS current_league_id))';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  await pglite.exec(`
    create role ${login} login;
    grant app_user to ${login};
    grant sign_in_store to ${login};
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** The statement a sentence ends with, without the words around it. */
const statementOf = (problem: string) =>
  problem
    .slice(problem.lastIndexOf(': ') + 2)
    .replace(/ \(or make it in a migration\)$/, '')
    .replace(/, then make it again as its migration does$/, '');

/**
 * Plants `plant`, expects exactly `said`, runs each sentence's statement; then, for a
 * mending in two steps, expects `thenSaid` and runs its statements too; expects none.
 */
async function plantedAndMended(plant: string, said: string[], thenSaid: string[] = []) {
  await pglite.exec(plant);
  const problems = await checkLoginRole(db, login);
  expect(problems).toEqual(said);
  for (const problem of problems) await pglite.exec(statementOf(problem));
  expect(await checkLoginRole(db, login)).toEqual(thenSaid);
  for (const problem of thenSaid) await pglite.exec(statementOf(problem));
  expect(await checkLoginRole(db, login)).toEqual([]);
}

/** What the guard says once the programs' fence policy is dropped (it fails closed). */
const missingFence = `public.programs is missing its policy programs_league_fence, which the migrations made, so its rows are not fenced as they meant: create policy programs_league_fence on public.programs as permissive for all to public using (${fence}) with check (${fence})`;

describe('the start-up guard reads the league fence (step 2.238)', () => {
  it('passes with nothing planted, for the login and for app_user', async () => {
    expect(await checkLoginRole(db, login)).toEqual([]);
    expect(await checkLoginRole(db, 'app_user')).toEqual([]);
  });

  it('(a) refuses a league table whose row-level security is on but not forced', async () => {
    await plantedAndMended('alter table public.games no force row level security', [
      'public.games has a league column but its row-level security is on but not forced, so its owner sees every league: alter table public.games force row level security',
    ]);
  });

  it('(a) refuses a league table whose row-level security is off', async () => {
    await plantedAndMended('alter table public.teams disable row level security', [
      'public.teams has a league column but its row-level security is off, so every role that may read it sees every league: alter table public.teams enable row level security',
    ]);
  });

  it('(a) refuses the leagues table itself, found as the table league columns point at', async () => {
    await plantedAndMended('alter table public.leagues no force row level security', [
      'public.leagues has a league column but its row-level security is on but not forced, so its owner sees every league: alter table public.leagues force row level security',
    ]);
  });

  it('(a) reads every schema, not only public', async () => {
    await plantedAndMended(
      'create schema made_up_side; create table made_up_side.ledger (id int, league_id uuid)',
      [
        'made_up_side.ledger has a league column but its row-level security is off, so every role that may read it sees every league: alter table made_up_side.ledger enable row level security, force row level security',
      ],
    );
  });

  it('(a) names a league table a new migration adds without a forced fence', async () => {
    // Planted as a migration would make it: in a public table the catalog lists.
    await pglite.exec(`
      create table public.made_up_new_league (
        id uuid primary key, league_id uuid not null references public.leagues (id));
      alter table public.made_up_new_league enable row level security;
    `);
    const asMigrated = {
      ...migrationCatalog,
      relations: [
        ...migrationCatalog.relations,
        { name: 'public.made_up_new_league', kind: 'r', owner: 'postgres', definition: null },
      ],
    };
    const problems = await checkFence(
      db,
      { login, mayBecome: [], reached: [login], databaseOwner: 'postgres' },
      asMigrated,
    );
    expect(problems).toEqual([
      'public.made_up_new_league has a league column but its row-level security is on but not forced, so its owner sees every league: alter table public.made_up_new_league force row level security',
    ]);
    await pglite.exec('drop table public.made_up_new_league');
  });

  it('(b) refuses a policy no migration made, such as using (true)', async () => {
    await plantedAndMended('create policy made_up_wide on public.games using (true)', [
      'public.games has a policy made_up_wide that no migration made, so its rule (to public using (true)) is not known to name the league: drop policy made_up_wide on public.games',
    ]);
  });

  it('(b) refuses a wide policy for a role the login inherits, and one on the leagues', async () => {
    await plantedAndMended(
      `create role made_up_reader nologin;
       grant select on public.people, public.leagues to made_up_reader;
       grant made_up_reader to ${login};
       create policy made_up_reader_sees_all on public.people for select to made_up_reader
         using (true);
       create policy made_up_every_league on public.leagues for select using (true);`,
      [
        'public.leagues has a policy made_up_every_league that no migration made, so its rule (to public using (true)) is not known to name the league: drop policy made_up_every_league on public.leagues',
        'public.people has a policy made_up_reader_sees_all that no migration made, so its rule (to made_up_reader using (true)) is not known to name the league: drop policy made_up_reader_sees_all on public.people',
      ],
    );
  });

  it('(b) refuses a migration’s policy whose rule was changed by hand', async () => {
    await plantedAndMended('alter policy games_league_fence on public.games using (true)', [
      `public.games has its policy games_league_fence changed from the migrations' (now to public using (true) with check (${fence})): alter policy games_league_fence on public.games to public using (${fence}) with check (${fence})`,
    ]);
  });

  it('(c) refuses a security-definer function the login may run that is not reviewed', async () => {
    // The migrations take EXECUTE from public by default, so the plant grants it by hand.
    // One statement takes it from every holder the login reaches.
    await plantedAndMended(
      `create function public.made_up_peek() returns bigint language sql security definer
         as 'select count(*) from public.games';
       grant execute on function public.made_up_peek() to app_user, public;`,
      [
        'made_up_app_login may run public.made_up_peek(), a security-definer function that is not on the reviewed list, so it may read past the league fence: revoke execute on function public.made_up_peek() from app_user, public',
      ],
    );
  });

  it('(c) reads every schema, and every role the login may become', async () => {
    await plantedAndMended(
      `create schema made_up_tools;
       create function made_up_tools.peek(wanted uuid) returns bigint language sql
         security definer as 'select count(*) from public.games where league_id = wanted';
       revoke execute on function made_up_tools.peek(uuid) from public;
       create role made_up_helper nologin;
       grant execute on function made_up_tools.peek(uuid) to made_up_helper;
       grant made_up_helper to ${login} with inherit false, set true;`,
      [
        'made_up_app_login may become made_up_helper, which may run made_up_tools.peek(wanted uuid), a security-definer function that is not on the reviewed list, so it may read past the league fence: revoke execute on function made_up_tools.peek(wanted uuid) from made_up_helper',
      ],
    );
  });

  it('(c) lets a trigger function be, which no one can call', async () => {
    await pglite.exec(`
      create function public.made_up_on_write() returns trigger language plpgsql
        security definer as $$ begin return new; end $$;
      grant execute on function public.made_up_on_write() to app_user;`);
    expect(await checkLoginRole(db, login)).toEqual([]);
    await pglite.exec('drop function public.made_up_on_write()');
  });

  it('(d) refuses a table or view in the migrations’ schemas that no migration made', async () => {
    await plantedAndMended(
      `create table public.made_up_extra (id int);
       create view platform.made_up_all_games as select * from public.games;`,
      [
        'platform.made_up_all_games is a view that no migration made, so nothing has checked its fence: drop view platform.made_up_all_games (or make it in a migration)',
        'public.made_up_extra is a table that no migration made, so nothing has checked its fence: drop table public.made_up_extra (or make it in a migration)',
      ],
    );
  });

  it('(a) holds a listed league table whose league column was renamed (T-470, changed)', async () => {
    // Found by its column alone, this table would vanish from the guard, and with it the
    // wide policy planted on it.
    await plantedAndMended(
      `alter table public.activity_log rename column league_id to lg;
       create policy made_up_wide on public.activity_log for select using (true);`,
      [
        'public.activity_log is a league table the migrations made, but its league column league_id is now named lg, so its fence cannot be read: alter table public.activity_log rename column lg to league_id',
        `public.activity_log has its policy activity_log_league_fence changed from the migrations' (now to public using (${fence.replace('league_id', 'lg')}) with check (${fence.replace('league_id', 'lg')})): alter policy activity_log_league_fence on public.activity_log to public using (${fence}) with check (${fence})`,
        'public.activity_log has a policy made_up_wide that no migration made, so its rule (to public using (true)) is not known to name the league: drop policy made_up_wide on public.activity_log',
      ],
    );
  });

  it('(b) refuses a fence policy whose roles alone were changed', async () => {
    await plantedAndMended('alter policy programs_league_fence on public.programs to app_user', [
      `public.programs has its policy programs_league_fence changed from the migrations' (now to app_user using (${fence}) with check (${fence})): alter policy programs_league_fence on public.programs to public using (${fence}) with check (${fence})`,
    ]);
  });

  it('(b) refuses a fence policy made again for one command only', async () => {
    await plantedAndMended(
      `drop policy programs_league_fence on public.programs;
       create policy programs_league_fence on public.programs for update
         using ${fence} with check ${fence};`,
      [
        `public.programs has its policy programs_league_fence changed from the migrations' (now for update to public using (${fence}) with check (${fence})): drop policy programs_league_fence on public.programs, then make it again as its migration does`,
      ],
      [missingFence],
    );
  });

  it('(b) refuses a fence policy made again as restrictive', async () => {
    await plantedAndMended(
      `drop policy programs_league_fence on public.programs;
       create policy programs_league_fence on public.programs as restrictive
         using ${fence} with check ${fence};`,
      [
        `public.programs has its policy programs_league_fence changed from the migrations' (now as restrictive to public using (${fence}) with check (${fence})): drop policy programs_league_fence on public.programs, then make it again as its migration does`,
      ],
      [missingFence],
    );
  });

  it('(c) refuses a reviewed function whose body, settings or owner changed (T-477)', async () => {
    const slug = 'public.find_league_by_slug(wanted text)';
    const again = `${slug} is a reviewed security-definer function whose`;
    const tail = `changed since the migrations made it, so its review no longer holds: run the migrations' own definition again`;
    const original = (
      await pglite.query<{ d: string }>(
        `select pg_get_functiondef('public.find_league_by_slug(text)'::regprocedure) as d`,
      )
    ).rows[0]!.d;
    // The `where` clauses taken out: the same name now answers every league.
    const widened = original.replace(/AS \$function\$[\s\S]*\$function\$/, (body) =>
      body.replace(/where[\s\S]*?(;|\$function\$)/i, (_whole, end: string) => ` ${end}`),
    );
    expect(widened).not.toBe(original);
    for (const [plant, part] of [
      [widened, 'body'],
      [`alter function public.find_league_by_slug(text) set search_path = public`, 'settings'],
      [
        `create role made_up_definer_owner nologin;
         alter function public.find_league_by_slug(text) owner to made_up_definer_owner;`,
        'owner',
      ],
    ] as const) {
      await pglite.exec(plant);
      expect(await checkLoginRole(db, login)).toEqual([`${again} ${part} ${tail}`]);
      await pglite.exec(
        `${original}; alter function public.find_league_by_slug(text) owner to postgres`,
      );
      expect(await checkLoginRole(db, login)).toEqual([]);
    }
  });

  it('(d) refuses a view, materialized view or copy elsewhere the login can read (T-476)', async () => {
    await plantedAndMended(
      `create schema made_up_copies;
       create view made_up_copies.every_program as select * from public.programs;
       create materialized view made_up_copies.kept_programs as select * from public.programs;
       grant usage on schema made_up_copies to ${login};
       grant select on made_up_copies.every_program, made_up_copies.kept_programs to ${login};`,
      [
        `made_up_copies.every_program is a view that no migration made, and ${login} may read it, so nothing has checked its fence: revoke select on table made_up_copies.every_program from ${login}`,
        `made_up_copies.kept_programs is a materialized view that no migration made, and ${login} may read it, so nothing has checked its fence: revoke select on table made_up_copies.kept_programs from ${login}`,
      ],
    );
    await plantedAndMended(
      `create role made_up_copier nologin;
       grant made_up_copier to ${login} with inherit false, set true;
       create table made_up_copies.program_names as select league_id as lg, name from public.programs;
       create view made_up_copies.program_leagues as select league_id from public.programs;
       grant usage on schema made_up_copies to made_up_copier;
       grant select on made_up_copies.program_names to made_up_copier;
       grant select (league_id) on made_up_copies.program_leagues to made_up_copier;`,
      [
        `made_up_copies.program_leagues is a view that no migration made, and ${login} may become made_up_copier, which may read it, so nothing has checked its fence: revoke select on table made_up_copies.program_leagues from made_up_copier`,
        `made_up_copies.program_names is a table that no migration made, and ${login} may become made_up_copier, which may read it, so nothing has checked its fence: revoke select on table made_up_copies.program_names from made_up_copier`,
      ],
    );
  });

  it('(d) lets be, in another schema, what the login cannot read', async () => {
    await pglite.exec(`
      create schema made_up_unread;
      create view made_up_unread.every_program as select * from public.programs;
      create table made_up_unread.copy as select league_id as lg from public.programs;
      grant select on made_up_unread.every_program to ${login};
      create role made_up_far nologin;
      grant usage on schema made_up_unread to made_up_far;
      grant select on made_up_unread.copy to made_up_far;`);
    // Select without the schema's use, and use through a role the login does not reach.
    expect(await checkLoginRole(db, login)).toEqual([]);
    await pglite.exec('drop schema made_up_unread cascade');
  });
  it('(d) refuses a listed table moved away and a view put in its place (T-481)', async () => {
    // The confirming look's plant: names alone matched, and the login read both leagues.
    await pglite.exec(`
      create schema made_up_hidden;
      alter table public.accounts set schema made_up_hidden;
      create view public.accounts as select * from public.programs;
      grant select on public.accounts to ${login};`);
    expect(await checkLoginRole(db, login)).toEqual([
      "public.accounts is a table the migrations made, but it is now a view, so it may hold rows of any league: drop view public.accounts, then run the migrations' own definition again",
      "public.accounts is missing its trigger accounts_on_update, which the migrations made, so what it keeps is not kept: run the migrations' own definition again",
    ]);
    await pglite.exec(`
      drop view public.accounts;
      alter table made_up_hidden.accounts set schema public;
      drop schema made_up_hidden;`);
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  it('(d) refuses a listed table replaced by one of the same name another role owns (T-481)', async () => {
    await pglite.exec(`
      create schema made_up_hidden;
      alter table public.accounts set schema made_up_hidden;
      create role made_up_other_owner nologin;
      create table public.accounts as select id, name from public.programs;
      alter table public.accounts owner to made_up_other_owner;
      grant select on public.accounts to ${login};`);
    expect(await checkLoginRole(db, login)).toEqual([
      'public.accounts is a table the migrations made, but it is now owned by made_up_other_owner, not postgres, so it may not be what they made: alter table public.accounts owner to postgres',
      "public.accounts is missing its trigger accounts_on_update, which the migrations made, so what it keeps is not kept: run the migrations' own definition again",
    ]);
    await pglite.exec(`
      drop table public.accounts;
      alter table made_up_hidden.accounts set schema public;
      drop schema made_up_hidden;`);
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  it('(c) refuses the fence’s own functions changed by hand, every one (T-477, widened)', async () => {
    const otherLeague = '00000000-0000-4000-8000-00000000000b';
    const plants: readonly (readonly [string, string, string])[] = [
      [
        'public.current_league_id()',
        `create or replace function public.current_league_id() returns uuid language sql
           stable parallel safe set search_path = pg_catalog, pg_temp
           as $$ select '${otherLeague}'::uuid $$`,
        'body',
      ],
      [
        'public.current_league_id()',
        'alter function public.current_league_id() volatile',
        'volatility',
      ],
      [
        'public.current_account_id()',
        `create or replace function public.current_account_id() returns uuid language sql
           stable parallel safe set search_path = pg_catalog, pg_temp
           as $$ select '${otherLeague}'::uuid $$`,
        'body',
      ],
      [
        'public.require_view_of_every_league()',
        `create or replace function public.require_view_of_every_league() returns void
           language plpgsql stable set search_path = pg_catalog, pg_temp as $$ begin end $$`,
        'body',
      ],
    ];
    for (const [signature, plant, part] of plants) {
      const original = (
        await pglite.query<{ d: string }>(
          `select pg_get_functiondef('${signature}'::regprocedure) as d`,
        )
      ).rows[0]!.d;
      await pglite.exec(plant);
      expect(await checkLoginRole(db, login)).toEqual([
        `${signature} is a function the migrations made whose ${part} changed since the migrations made it, so the fence or the command that calls it may no longer hold: run the migrations' own definition again`,
      ]);
      await pglite.exec(original);
      expect(await checkLoginRole(db, login)).toEqual([]);
    }
  });

  it('(c) refuses a function the migrations made that is missing', async () => {
    // As a catalog that lists one more function than there is: what a function dropped
    // by hand looks like, without dropping one of the fence's own.
    const listed = migrationCatalog.functions.find(
      (shape) => shape.signature === 'public.current_league_id()',
    )!;
    const withGone = {
      ...migrationCatalog,
      functions: [...migrationCatalog.functions, { ...listed, signature: 'public.made_up_gone()' }],
    };
    const roles = { login, mayBecome: [], reached: [login], databaseOwner: 'postgres' };
    expect(await checkFence(db, roles, withGone)).toEqual([
      "public.made_up_gone() is a function the migrations made, but it is missing, so what calls it fails: run the migrations' own definition again",
    ]);
    expect(await checkFence(db, roles)).toEqual([]);
  });

  it('(b) names a fence policy dropped with its league column (cascade) and the column made again', async () => {
    await plantedAndMended(
      `alter table public.courts drop column league_id cascade;
       alter table public.courts add column league_id uuid;`,
      [
        `public.courts is missing its policy courts_league_fence, which the migrations made, so its rows are not fenced as they meant: create policy courts_league_fence on public.courts as permissive for all to public using (${fence}) with check (${fence})`,
      ],
    );
  });

  // T-490: the website's login reaches nothing in the job queue's schema, which the
  // migrations made (0031) for queue_owner, so a table there it may read is refused.
  it('(d) refuses the website any reading of the job queue’s schema (T-490)', async () => {
    await pglite.exec(`
      create table pgboss.job (id uuid, name text, data jsonb);
      grant usage on schema pgboss to ${login};
      grant select on pgboss.job to ${login};`);
    const said = await checkLoginRole(db, login);
    expect(said).toEqual([
      `${login} may use the job queue (the pgboss schema), so ${login} could read or change a queued job: grant queue_owner to current_user with set true; set role queue_owner; revoke all on schema pgboss from ${login} cascade; reset role; revoke queue_owner from current_user`,
      `pgboss.job is a table of the job queue (the pgboss schema) that ${login} has a right on, so the website could read or change a queued job: revoke all on table pgboss.job from ${login}`,
    ]);
    for (const problem of said) await pglite.exec(statementOf(problem));
    expect(await checkLoginRole(db, login)).toEqual([]);
    await pglite.exec('drop table pgboss.job');
  });

  // Found on the real PostgreSQL (step 2.112, builder 2): the worker's login used as the
  // website's reads pg-boss's tables through queue_owner, and no sentence may say to drop one.
  // Since the review (T-491) the queue's own check names it alone: the membership is the
  // fault, and a revoke of select from queue_owner, which owns the table, changed nothing.
  it('(d) never says to drop a table in the job queue’s schema, even judging the website (T-490)', async () => {
    await pglite.exec(`
      create table pgboss.job (id uuid, name text, data jsonb);
      alter table pgboss.job owner to queue_owner;
      grant queue_owner to ${login};`);
    try {
      const said = await checkLoginRole(db, login);
      expect(said).toEqual([
        `${login} may become queue_owner, which owns a table (pgboss.job): revoke queue_owner from ${login}`,
        `${login} is a member of queue_owner, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke queue_owner from ${login}`,
      ]);
      expect(said.join(' ')).not.toMatch(/drop table/);
      await pglite.exec(statementOf(said[1] ?? ''));
      expect(await checkLoginRole(db, login)).toEqual([]);
    } finally {
      await pglite.exec(`revoke queue_owner from ${login}; drop table if exists pgboss.job`);
    }
  });

  // The worker's login holds queue_owner and owns pg-boss's tables (T-490); there only an
  // ordinary table without a league column is let be (T-482's rule, now the worker's).
  it('(d) lets the worker have pg-boss’s own tables, but never a view of a league table (T-482, T-490)', async () => {
    await pglite.exec(`
      grant queue_owner to ${login};
      set role ${login};
      create table pgboss.job (id uuid, name text, data jsonb);
      reset role;`);
    expect(await checkWorkerLoginRole(db, login)).toEqual([]);
    await pglite.exec(`
      create table pgboss.kept (id uuid, league_id uuid);
      create view pgboss.every_program as select name from public.programs;
      grant select on pgboss.kept, pgboss.every_program to ${login};`);
    const said = await checkWorkerLoginRole(db, login);
    expect(said).toEqual([
      'pgboss.kept has a league column but its row-level security is off, so every role that may read it sees every league: alter table pgboss.kept enable row level security, force row level security',
      `pgboss.every_program is a view that no migration made, and ${login} may read it, so nothing has checked its fence: revoke select on table pgboss.every_program from ${login}`,
      // T-493: a league's rows do not belong in the queue's schema; moved out, never dropped.
      `pgboss.kept has a league column, so it does not belong in the job queue's schema, which is for pg-boss's own tables: ${login} may use it there, and its owner postgres could switch its fence off; give it to the migrations' owner, out of the queue's schema (its rows are kept): alter table pgboss.kept set schema public; alter table public.kept owner to postgres`,
    ]);
    expect(said.join(' ')).not.toMatch(/drop (table|view)/);
    await pglite.exec('drop table pgboss.kept; drop view pgboss.every_program');
    expect(await checkWorkerLoginRole(db, login)).toEqual([]);
    await pglite.exec(`drop table pgboss.job; revoke queue_owner from ${login}`);
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  // T-485: the second look's plant B. A schema named as the session's user is the "$user"
  // entry of the search path, so a plain current_league_id() there is found first, and the
  // session printed the policy as `current_league_id()` unqualified, as the catalog had it.
  const shadowFence = (schema: string) =>
    `(league_id = ( SELECT ${schema}.current_league_id() AS current_league_id))`;
  const shadowed = (schema: string) =>
    `public.programs has its policy programs_league_fence changed from the migrations' (now to public using (${shadowFence(schema)}) with check (${shadowFence(schema)})): alter policy programs_league_fence on public.programs to public using (${fence}) with check (${fence})`;

  it('(b) refuses a policy calling a current_league_id of the "$user" schema (T-485)', async () => {
    const { rows } = await pglite.query<{ me: string }>('select current_user::text as me');
    const user = rows[0]?.me ?? '';
    // PostgreSQL's own default search path; PGlite's session may not start with it.
    await plantedAndMended(
      `set search_path = "$user", public;
       create schema ${user};
       create function ${user}.current_league_id() returns uuid language sql stable
         as $$ select null::uuid $$;
       alter policy programs_league_fence on public.programs
         using (league_id = (select current_league_id()))
         with check (league_id = (select current_league_id()));`,
      [shadowed(user)],
    );
    await pglite.exec(`reset search_path; drop schema ${user} cascade`);
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  it('(b) refuses it with the search path set for the session, as a role setting does (T-485)', async () => {
    await plantedAndMended(
      `create schema made_up_shadow;
       create function made_up_shadow.current_league_id() returns uuid language sql stable
         as $$ select null::uuid $$;
       set search_path = made_up_shadow, public;
       alter policy programs_league_fence on public.programs
         using (league_id = (select current_league_id()))
         with check (league_id = (select current_league_id()));`,
      [shadowed('made_up_shadow')],
    );
    await pglite.exec('reset search_path; drop schema made_up_shadow cascade');
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  // T-486: the second look's item 4. A rule or a trigger on a league table copies its rows
  // elsewhere on each change; the copy (a table without a league column in pg-boss's schema,
  // which the website's login cannot read since T-490) is not what is refused: the rule or
  // trigger is.
  const copySchema = 'create table pgboss.c4 (id uuid, lid text);';
  const dropCopySchema = 'drop table pgboss.c4';

  it('(e) refuses a rule no migration made on a league table, which copies its rows (T-486)', async () => {
    await pglite.exec(copySchema);
    await plantedAndMended(
      `create rule made_up_copy as on update to public.programs do also
         insert into pgboss.c4 (id, lid) values (new.id, new.league_id::text)`,
      [
        'public.programs has a rule made_up_copy that no migration made, so what it puts in place of each change is not known to keep to the league fence: drop rule made_up_copy on public.programs',
      ],
    );
    await pglite.exec(dropCopySchema);
  });

  it('(e) refuses a trigger no migration made, whose function is a security definer (T-486)', async () => {
    await pglite.exec(copySchema);
    await plantedAndMended(
      `create schema made_up_hooks;
       create function made_up_hooks.copy() returns trigger language plpgsql security definer
         as $$ begin insert into pgboss.c4 values (new.id, new.league_id::text); return new; end $$;
       create trigger made_up_copy after update on public.programs
         for each row execute function made_up_hooks.copy();`,
      [
        'public.programs has a trigger made_up_copy that no migration made, so what it does on each change is not known to keep to the league fence: drop trigger made_up_copy on public.programs',
      ],
    );
    await pglite.exec(`drop schema made_up_hooks cascade; ${dropCopySchema}`);
  });

  it('(e) refuses a migration’s trigger disabled, or made again otherwise (T-486)', async () => {
    await plantedAndMended('alter table public.programs disable trigger programs_on_update', [
      'public.programs has its trigger programs_on_update, which the migrations made, disabled, so what it keeps is not kept: alter table public.programs enable trigger programs_on_update',
    ]);
    const made = migrationCatalog.triggers.find(
      (trigger) => trigger.table === 'public.programs' && trigger.name === 'programs_on_update',
    );
    // The catalog holds a hash of the definition, not its text (so it names no column).
    expect(made?.definition).toMatch(/^[0-9a-f]{64}$/);
    await pglite.exec(`
      drop trigger programs_on_update on public.programs;
      create trigger programs_on_update after update on public.programs
        for each row execute function public.on_row_update();`);
    const said = await checkLoginRole(db, login);
    expect(said).toEqual([
      "public.programs has its trigger programs_on_update changed from the migrations', so what it does on each change may cross the league fence: drop trigger programs_on_update on public.programs, then run the migrations' own definition again",
    ]);
    // The migrations' own definition, made again, matches the catalog's hash and puts it right.
    await pglite.exec(`
      drop trigger programs_on_update on public.programs;
      create trigger programs_on_update before update on public.programs
        for each row execute function public.on_row_update();`);
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  it('(d) refuses the worker any view or materialized view in the queue’s schema, whatever its columns (T-482, T-490)', async () => {
    await pglite.exec(`
      grant queue_owner to ${login};
      create table pgboss.job (id uuid, name text, data jsonb);
      create view pgboss.queue_names as select name from pgboss.job;
      create materialized view pgboss.job_ids as select id from pgboss.job;
      grant select on pgboss.job, pgboss.queue_names, pgboss.job_ids to ${login};`);
    const said = await checkWorkerLoginRole(db, login);
    expect(said).toEqual([
      `pgboss.job_ids is a materialized view that no migration made, and ${login} may read it, so nothing has checked its fence: revoke select on table pgboss.job_ids from ${login}`,
      `pgboss.queue_names is a view that no migration made, and ${login} may read it, so nothing has checked its fence: revoke select on table pgboss.queue_names from ${login}`,
    ]);
    expect(said.join(' ')).not.toMatch(/drop table/);
    for (const problem of said) await pglite.exec(statementOf(problem));
    expect(await checkWorkerLoginRole(db, login)).toEqual([]);
    await pglite.exec(
      `drop materialized view pgboss.job_ids; drop view pgboss.queue_names; drop table pgboss.job; revoke queue_owner from ${login}`,
    );
    expect(await checkLoginRole(db, login)).toEqual([]);
  });
});
