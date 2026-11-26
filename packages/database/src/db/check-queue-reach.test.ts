// Step 2.112's review, on PGlite (a superuser may grant the predefined roles here, which
// the real server's owner may not): what each start asks PostgreSQL the login CAN do, not
// only what the grant lists say (T-491), the tables and triggers the website may change
// (T-492), and 0031's own refusals. Each sentence's statement is run as printed, and the
// start then passes.
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkLoginRole, checkWorkerLoginRole } from './check-login-role.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';
import { predefinedRoleProblems, predefinedRoles } from './predefined-roles.ts';

const migration = readFileSync(
  new URL(
    '../../../../supabase/migrations/0031_the_job_queue_has_its_own_owner.sql',
    import.meta.url,
  ),
  'utf8',
);

const web = 'made_up_reach_web';
const worker = 'made_up_reach_worker';
let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  await pglite.exec(`
    create role ${web} login;
    create role ${worker} login;
    create role made_up_reach_middle nologin;
    grant app_user to ${web}, ${worker};
    grant queue_owner to ${worker};
    set role ${worker};
    create table pgboss.job (id int, data text);
    create sequence pgboss.job_number;
    create function pgboss.job_now() returns int language sql as 'select 1';
    reset role;`);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** The statement a sentence ends with. */
const statementOf = (problem: string) => problem.slice(problem.lastIndexOf(': ') + 2);

const mended = async (said: readonly string[], check: () => Promise<string[]>) => {
  for (const problem of said) await pglite.exec(statementOf(problem));
  expect(await check()).toEqual([]);
};

const webCheck = () => checkLoginRole(db, web);
const workerCheck = () => checkWorkerLoginRole(db, worker);

describe('the predefined roles (T-491)', () => {
  it('passes both logins as they are', async () => {
    expect(await webCheck()).toEqual([]);
    expect(await workerCheck()).toEqual([]);
  });

  const named = [
    'pg_read_all_data',
    'pg_write_all_data',
    'pg_read_server_files',
    'pg_write_server_files',
    'pg_execute_server_program',
    'pg_monitor',
  ];
  for (const role of named)
    it(`refuses ${role} for either login, held directly or through app_user`, async () => {
      const why = predefinedRoles.get(role) ?? '';
      for (const [login, check] of [
        [web, webCheck],
        [worker, workerCheck],
      ] as const) {
        await pglite.exec(`grant ${role} to ${login}`);
        const said = await check();
        expect(said).toEqual([
          `${login} is a member of ${role}, which ${why}, past every grant the check reads (T-491): revoke ${role} from ${login}`,
        ]);
        await mended(said, check);
      }
      await pglite.exec(`grant ${role} to app_user`);
      const said = await webCheck();
      expect(said).toEqual([
        `${web} is a member of ${role} through app_user, which ${why}, past every grant the check reads (T-491): revoke ${role} from app_user`,
      ]);
      await mended(said, webCheck);
    });

  it('the website writing queued jobs through pg_write_all_data, as the review did, is refused', async () => {
    await pglite.exec(`grant pg_write_all_data to ${web}`);
    await pglite.exec(
      `set role ${web}; insert into pgboss.job values (2, 'by the website'); reset role`,
    );
    expect(await webCheck()).toContainEqual(expect.stringMatching(/revoke pg_write_all_data from/));
    await pglite.exec(`revoke pg_write_all_data from ${web}; delete from pgboss.job`);
    expect(await webCheck()).toEqual([]);
  });

  it('names only the first predefined role on a way, and refuses one it does not know', () => {
    expect(
      predefinedRoleProblems(web, [
        [web],
        [web, 'pg_monitor'],
        [web, 'pg_monitor', 'pg_read_all_stats'],
      ]),
    ).toEqual([
      `${web} is a member of pg_monitor, which ${predefinedRoles.get('pg_monitor') ?? ''}, past every grant the check reads (T-491): revoke pg_monitor from ${web}`,
    ]);
    expect(predefinedRoleProblems(web, [[web, 'made_up_reach_middle', 'pg_made_up_new']])).toEqual([
      `${web} is a member of pg_made_up_new through made_up_reach_middle, which is a predefined role this check does not know, so what it gives has not been read, past every grant the check reads (T-491): revoke pg_made_up_new from made_up_reach_middle`,
    ]);
  });
});

describe('what the website may do in the job queue’s schema, as PostgreSQL judges it (T-491)', () => {
  it('refuses a right on a table, a sequence or a function there, even without the schema', async () => {
    await pglite.exec(`
      set role ${worker};
      grant insert on pgboss.job to app_user;
      grant usage on sequence pgboss.job_number to ${web};
      grant execute on function pgboss.job_now() to ${web};
      reset role;`);
    const said = await webCheck();
    const queued = 'so the website could read or change a queued job';
    const asWorker = (statement: string) =>
      `grant ${worker} to current_user with set true; set role ${worker}; ${statement}; reset role; revoke ${worker} from current_user`;
    expect(said).toEqual([
      `pgboss.job is a table of the job queue (the pgboss schema) that ${web} has a right on, ${queued}: ${asWorker('revoke all on table pgboss.job from app_user')}`,
      // pg-boss's own functions everyone may run (they are no definers) are let be.
      `pgboss.job_now() is a function of the job queue (the pgboss schema) that ${web} has a right on, ${queued}: ${asWorker(`revoke all on function pgboss.job_now() from ${web}`)}`,
      `pgboss.job_number is a sequence of the job queue (the pgboss schema) that ${web} has a right on, ${queued}: ${asWorker(`revoke all on sequence pgboss.job_number from ${web}`)}`,
    ]);
    await mended(said, webCheck);
  });

  it('refuses a security-definer function there that everyone may run, and lets pg-boss’s own be', async () => {
    await pglite.exec(`
      set role ${worker};
      create function pgboss.made_up_definer() returns int language sql security definer
        as 'select 1';
      reset role;`);
    const said = await webCheck();
    expect(said).toEqual([
      `pgboss.made_up_definer() is a function of the job queue (the pgboss schema) that ${web} has a right on, so the website could read or change a queued job: grant ${worker} to current_user with set true; set role ${worker}; revoke all on function pgboss.made_up_definer() from public; reset role; revoke ${worker} from current_user`,
      `${web} may run, or use the schema of, pgboss.made_up_definer(), a security-definer function that is not on the reviewed list, so it may read past the league fence, whoever may run it (T-499): grant ${worker} to current_user with set true; set role ${worker}; alter function pgboss.made_up_definer() security invoker; reset role; revoke ${worker} from current_user`,
    ]);
    await mended(said, webCheck);
    await pglite.exec('drop function pgboss.made_up_definer()');
  });
});

describe('what the website may change elsewhere (T-492)', () => {
  it('refuses a table it may only insert into, and the definer trigger on it, by name', async () => {
    await pglite.exec(`
      create schema made_up_side;
      grant usage, create on schema made_up_side to ${worker};
      grant usage on schema made_up_side to app_user;
      set role ${worker};
      create table made_up_side.inbox (v text);
      grant insert on made_up_side.inbox to app_user;
      create function made_up_side.tg() returns trigger language plpgsql security definer
        set search_path = pg_catalog
        as $f$ begin insert into pgboss.job values (2, new.v); return null; end $f$;
      create trigger tg before insert on made_up_side.inbox
        for each row execute function made_up_side.tg();
      reset role;`);
    const said = await webCheck();
    const asWorker = (statement: string) =>
      `grant ${worker} to current_user with set true; set role ${worker}; ${statement}; reset role; revoke ${worker} from current_user`;
    expect(said).toEqual([
      `${web} may run, or use the schema of, made_up_side.tg(), a security-definer function that is not on the reviewed list, so it may read past the league fence, whoever may run it (T-499): ${asWorker('alter function made_up_side.tg() security invoker')}`,
      `${web} may change made_up_side.inbox, whose trigger tg runs made_up_side.tg(), a security-definer function that is not on the reviewed list, so a change there may reach past the league fence or into the job queue: ${asWorker('drop trigger tg on made_up_side.inbox')}`,
      `made_up_side.inbox is a table that no migration made, and ${web} may change it, so nothing has checked its fence: ${asWorker('revoke all on table made_up_side.inbox from app_user')}`,
    ]);
    await mended(said, webCheck);
    await pglite.exec('drop schema made_up_side cascade');
  });
});

describe('a right on one column is a right to change (T-492, T-497)', () => {
  it('refuses the definer trigger on a table the website may insert into by one column only', async () => {
    await pglite.exec(`
      create schema made_up_side;
      grant usage, create on schema made_up_side to ${worker};
      grant usage on schema made_up_side to app_user;
      set role ${worker};
      create table made_up_side.inbox (v text, w text);
      grant insert (v) on made_up_side.inbox to app_user;
      create function made_up_side.tg() returns trigger language plpgsql security definer
        set search_path = pg_catalog
        as $f$ begin insert into pgboss.job values (2, new.v); return null; end $f$;
      create trigger tg before insert on made_up_side.inbox
        for each row execute function made_up_side.tg();
      reset role;`);
    const said = await webCheck();
    const asWorker = (statement: string) =>
      `grant ${worker} to current_user with set true; set role ${worker}; ${statement}; reset role; revoke ${worker} from current_user`;
    expect(said).toEqual([
      `${web} may run, or use the schema of, made_up_side.tg(), a security-definer function that is not on the reviewed list, so it may read past the league fence, whoever may run it (T-499): ${asWorker('alter function made_up_side.tg() security invoker')}`,
      `${web} may change made_up_side.inbox, whose trigger tg runs made_up_side.tg(), a security-definer function that is not on the reviewed list, so a change there may reach past the league fence or into the job queue: ${asWorker('drop trigger tg on made_up_side.inbox')}`,
      `made_up_side.inbox is a table that no migration made, and ${web} may change it, so nothing has checked its fence: ${asWorker('revoke all on table made_up_side.inbox from app_user')}`,
    ]);
    await mended(said, webCheck);
    await pglite.exec('drop schema made_up_side cascade');
  });
});

describe('the fence never drops a table named like pg-boss’s own in public (T-494)', () => {
  it('says to ask, not to drop', async () => {
    await pglite.exec('create table public.job (id int)');
    const said = await webCheck();
    expect(said).toEqual([
      "public.job is a table that no migration made, named like one of pg-boss's own, so it may hold queued jobs from before the job queue had its own schema, and nothing has checked its fence: do not drop it; ask the lead, who moves its jobs or drops it (T-494)",
    ]);
    await pglite.exec('drop table public.job');
  });
});

describe('0031’s own refusals', () => {
  it('stops on a queue_owner with a login or a power, and changes nothing', async () => {
    await pglite.exec('alter role queue_owner login');
    await expect(pglite.exec(migration)).rejects.toThrow(
      'the role queue_owner exists with a login or a power: alter role queue_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
    );
    await pglite.exec('alter role queue_owner nologin');
    await pglite.exec(migration);
  });

  it('stops on a queue_owner that is a member of another role', async () => {
    await pglite.exec('grant made_up_reach_middle to queue_owner');
    await expect(pglite.exec(migration)).rejects.toThrow(
      'the role queue_owner is a member of another role, so it could act as that role: revoke that role from queue_owner',
    );
    await pglite.exec('revoke made_up_reach_middle from queue_owner');
    await pglite.exec(migration);
    expect(await workerCheck()).toEqual([]);
  });
});
