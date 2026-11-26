// Step 2.238: the start-up guard reads the league fence itself. Each fault is planted on a
// fresh database, named by checkLoginRole (the one function the website, the worker and
// `npm run test:real-postgres` run) in its sentence, and then put right by running the very
// statement the sentence gives, after which the guard passes again.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkFence } from './check-fence.ts';
import { checkLoginRole } from './check-login-role.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';
import { migrationCatalog } from './migration-catalog.ts';

const login = 'made_up_app_login';
const fence = '(league_id = ( SELECT current_league_id() AS current_league_id))';

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

/** Plants `plant`, expects exactly `said`, runs each sentence's statement, expects none. */
async function plantedAndMended(plant: string, said: string[]) {
  await pglite.exec(plant);
  const problems = await checkLoginRole(db, login);
  expect(problems).toEqual(said);
  for (const problem of problems) await pglite.exec(statementOf(problem));
  expect(await checkLoginRole(db, login)).toEqual([]);
}

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
      relations: [...migrationCatalog.relations, 'public.made_up_new_league'],
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
    );
    await pglite.exec(
      `create policy programs_league_fence on public.programs using ${fence} with check ${fence}`,
    );
    expect(await checkLoginRole(db, login)).toEqual([]);
  });

  it('(b) refuses a fence policy made again as restrictive', async () => {
    await plantedAndMended(
      `drop policy programs_league_fence on public.programs;
       create policy programs_league_fence on public.programs as restrictive
         using ${fence} with check ${fence};`,
      [
        `public.programs has its policy programs_league_fence changed from the migrations' (now as restrictive to public using (${fence}) with check (${fence})): drop policy programs_league_fence on public.programs, then make it again as its migration does`,
      ],
    );
    await pglite.exec(
      `create policy programs_league_fence on public.programs using ${fence} with check ${fence}`,
    );
    expect(await checkLoginRole(db, login)).toEqual([]);
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
});
