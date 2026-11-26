// Step 2.112's review on a real PostgreSQL (T-491 to T-494): the owner, made as Supabase's
// `postgres` is (no superuser), is the only role a hosted set-up runs statements as. Each
// attack the review found is planted here, the start refuses it by name, the printed
// statement is run by the owner exactly as printed, and the start then passes (or, for a
// league's rows in the queue's schema, the worker can no longer switch their fence off).
import {
  checkLoginRole,
  checkQueueSchema,
  checkWorkerLoginRole,
  connectPostgresDriver,
  type DatabaseHandle,
  type PostgresDriver,
} from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ca, dropLogin, fresh, makeLogin, ownerDatabase, ownerSession } from './server.ts';

const word = fresh();
const web = `rq_web_${word}`;
const worker = `rq_worker_${word}`;
const side = `rq_side_${word}`;
let owner: PostgresDriver;
let db: DatabaseHandle;
let ownerName = '';
let webUrl = '';
let workerUrl = '';

/** Runs `text` as one login, on a connection of its own. */
async function as(url: string, text: string): Promise<void> {
  const session = await connectPostgresDriver(url, { ca });
  try {
    await session.exec(text);
  } finally {
    await session.close();
  }
}

/** The statement a sentence ends with. */
const statementOf = (problem: string) => problem.slice(problem.lastIndexOf(': ') + 2);

const webCheck = () => checkLoginRole(db, web);
const workerCheck = async () => [
  ...(await checkWorkerLoginRole(db, worker)),
  ...(await checkQueueSchema(db, worker)),
];

/** The owner runs `statement` as the worker's login for that one statement (mending.ts). */
const asWorker = (statement: string) =>
  `grant ${worker} to current_user with set true; set role ${worker}; ${statement}; ` +
  `reset role; revoke ${worker} from current_user`;

beforeAll(async () => {
  owner = await ownerSession();
  db = ownerDatabase();
  ownerName = String((await owner.query('select current_user as name')).rows[0]?.name);
  webUrl = await makeLogin(owner, web, ['app_user', 'sign_in_store']);
  workerUrl = await makeLogin(owner, worker, ['app_user', 'queue_owner']);
});
afterAll(async () => {
  await owner.exec(`drop schema if exists ${side} cascade`);
  await dropLogin(owner, worker, workerUrl);
  await dropLogin(owner, web, webUrl);
  await db.close();
  await owner.close();
});

describe('the review’s attacks, refused by name and mended as printed', () => {
  it('starts both logins as they are made', async () => {
    expect(await webCheck()).toEqual([]);
    expect(await workerCheck()).toEqual([]);
  });

  it('(T-492) refuses the website a table it may only insert into, with a definer trigger writing a queued job', async () => {
    await as(workerUrl, `create table pgboss.rq_job (id int, data text)`);
    await owner.exec(`
      create schema ${side};
      grant usage, create on schema ${side} to ${worker};
      grant usage on schema ${side} to app_user`);
    await as(
      workerUrl,
      `create table ${side}.inbox (v text);
       grant insert on ${side}.inbox to app_user;
       create function ${side}.tg() returns trigger language plpgsql security definer
         set search_path = pg_catalog
         as $f$ begin insert into pgboss.rq_job values (2, new.v); return null; end $f$;
       create trigger tg before insert on ${side}.inbox
         for each row execute function ${side}.tg()`,
    );
    const said = await webCheck();
    expect(said).toEqual([
      `${web} may change ${side}.inbox, whose trigger tg runs ${side}.tg(), a security-definer function that is not on the reviewed list, so a change there may reach past the league fence or into the job queue: ${asWorker(`drop trigger tg on ${side}.inbox`)}`,
      `${side}.inbox is a table that no migration made, and ${web} may change it, so nothing has checked its fence: ${asWorker(`revoke all on table ${side}.inbox from app_user`)}`,
    ]);
    for (const problem of said) await owner.exec(statementOf(problem));
    expect(await webCheck()).toEqual([]);
    await as(workerUrl, `drop table ${side}.inbox, pgboss.rq_job; drop function ${side}.tg()`);
  });

  it('(T-493) refuses the worker a league table in the queue’s schema until it is moved out, and the move ends its reach', async () => {
    await as(
      workerUrl,
      `create table pgboss.rq_copy (league_id uuid, name text);
       insert into pgboss.rq_copy values (gen_random_uuid(), 'a made-up player');
       alter table pgboss.rq_copy enable row level security, force row level security;
       create policy p on pgboss.rq_copy using (true)`,
    );
    const said = await workerCheck();
    const move = said.find((problem) => problem.startsWith('pgboss.rq_copy has a league column'));
    expect(move).toBe(
      `pgboss.rq_copy has a league column, so it does not belong in the job queue's schema, which is for pg-boss's own tables: ${worker} may use it there, and its owner ${worker} could switch its fence off; give it to the migrations' owner, out of the queue's schema (its rows are kept): grant ${worker} to current_user with set true, inherit true; alter table pgboss.rq_copy set schema public; alter table public.rq_copy owner to ${ownerName}; revoke ${worker} from current_user`,
    );
    expect(said.join(' ')).not.toMatch(/drop table|revoke select/);
    await owner.exec(statementOf(move ?? ''));
    // The review's next step: the worker switches the fence off and reads the rows.
    await expect(
      as(workerUrl, 'alter table public.rq_copy no force row level security'),
    ).rejects.toThrow(/must be owner/);
    await expect(as(workerUrl, 'select name from public.rq_copy')).rejects.toThrow(
      /permission denied/,
    );
    expect((await owner.query('select count(*)::int as kept from public.rq_copy')).rows).toEqual([
      { kept: 1 },
    ]);
    // Still refused (a table no migration made in public), never passed.
    expect(await workerCheck()).not.toEqual([]);
    await owner.exec('drop table public.rq_copy');
    expect(await workerCheck()).toEqual([]);
  });

  it('(review, medium 2a) a membership the website granted itself under the owner’s is revoked with cascade', async () => {
    await owner.exec(`grant queue_owner to ${web} with admin true, inherit false, set false`);
    await as(webUrl, `grant queue_owner to ${web} with set true`);
    const said = await webCheck();
    const sentence = `${web} is a member of queue_owner, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke queue_owner from ${web} cascade`;
    expect(said).toContainEqual(sentence);
    await owner.exec(statementOf(sentence));
    expect(await webCheck()).toEqual([]);
  });

  it('(review, medium 2b) everyone’s use of the schema, granted as queue_owner, is revoked as queue_owner', async () => {
    await owner.exec(`grant queue_owner to current_user with set true; set role queue_owner;
      grant usage on schema pgboss to public; reset role; revoke queue_owner from current_user`);
    const said = await webCheck();
    expect(said).toEqual([
      `public may use the job queue (the pgboss schema), so ${web} could read or change a queued job: grant queue_owner to current_user with set true; set role queue_owner; revoke all on schema pgboss from public cascade; reset role; revoke queue_owner from current_user`,
    ]);
    await owner.exec(statementOf(said[0] ?? ''));
    expect(await webCheck()).toEqual([]);
  });

  it('(review, medium 2c) the schema owned by the owner is given back to queue_owner by a statement the owner can run', async () => {
    await owner.exec(`grant queue_owner to current_user with set true, inherit true;
      alter schema pgboss owner to current_user; revoke queue_owner from current_user`);
    const said = await checkQueueSchema(db, worker);
    expect(said[0]).toBe(
      `the pgboss schema is owned by ${ownerName}, not queue_owner: grant queue_owner to current_user with set true; alter schema pgboss owner to queue_owner; revoke queue_owner from current_user`,
    );
    await owner.exec(statementOf(said[0] ?? ''));
    expect(await workerCheck()).toEqual([]);
    expect(await webCheck()).toEqual([]);
  });

  it('(T-491) the owner here may not grant a predefined role, so that refusal is proved on PGlite', async () => {
    await expect(owner.exec(`grant pg_write_all_data to ${web}`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
