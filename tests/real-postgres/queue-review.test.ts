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
const agg = `rq_agg_${word}`;
const aggOwner = `rq_agg_owner_${word}`;
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

/** The statements of `text`, split at each `; ` outside a dollar-quoted body. */
function piecesOf(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  let tag: string | null = null;
  for (let place = 0; place < text.length; place += 1) {
    const quote = /^\$\w*\$/.exec(text.slice(place))?.[0];
    if (quote !== undefined) {
      if (tag === null) tag = quote;
      else if (quote === tag) tag = null;
      place += quote.length - 1;
    } else if (tag === null && text.startsWith('; ', place)) {
      pieces.push(text.slice(start, place));
      start = place + 2;
      place += 1;
    }
  }
  return [...pieces, text.slice(start)];
}

/** Runs `text` one statement at a time, each on its own, stopping at the first error. */
async function oneAtATime(text: string): Promise<void> {
  for (const piece of piecesOf(text)) await owner.exec(piece);
}

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
  const me = (await owner.query('select current_user as name')).rows[0] as { name?: unknown };
  ownerName = String(me.name);
  webUrl = await makeLogin(owner, web, ['app_user', 'sign_in_store']);
  workerUrl = await makeLogin(owner, worker, ['app_user', 'queue_owner']);
});
afterAll(async () => {
  await owner.exec(`drop schema if exists ${side} cascade`);
  await owner.exec(`drop schema if exists ${agg} cascade; drop role if exists ${aggOwner}`);
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
      `${web} may run, or use the schema of, ${side}.tg(), a security-definer function that is not on the reviewed list, so it may read past the league fence, whoever may run it (T-499): ${asWorker(`alter function ${side}.tg() security invoker`)}`,
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
      `pgboss.rq_copy has a league column, so it does not belong in the job queue's schema, which is for pg-boss's own tables: ${worker} may use it there, and its owner ${worker} could switch its fence off; give it to the migrations' owner, out of the queue's schema (its rows are kept): do $mend$ begin grant ${worker} to current_user with set true, inherit true; alter table pgboss.rq_copy set schema public; alter table public.rq_copy owner to ${ownerName}; revoke ${worker} from current_user; end $mend$`,
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
    // Still refused (a table no migration made in public), never passed, and never by a drop
    // that would destroy the rows the move kept (T-497).
    const after = await workerCheck();
    expect(after).toContainEqual(
      "public.rq_copy is a table that no migration made, with a league column, so it may hold a league's rows (as a table moved out of the job queue's schema does), and nothing has checked its fence: do not drop it; ask the lead, who moves its rows or drops it (T-494, T-497)",
    );
    expect(after.join(' ')).not.toMatch(/drop table/);
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

  it('(T-497) the move is one statement: when public already has the name, it fails whole and leaves no grant behind', async () => {
    await owner.exec('create table public.rq_clash (id int)');
    await as(workerUrl, 'create table pgboss.rq_clash (league_id uuid, name text)');
    const said = await workerCheck();
    const move = said.find((problem) =>
      problem.startsWith('pgboss.rq_clash has a league column, so it does not belong'),
    );
    // As an editor that runs one statement at a time and stops at the first error: the
    // mending is one statement, so the grant before the failed move is never left behind.
    expect(piecesOf(statementOf(move ?? ''))).toHaveLength(1);
    await expect(oneAtATime(statementOf(move ?? ''))).rejects.toThrow(/already exists/);
    const held = await owner.query(
      `select count(*)::int as held from pg_catalog.pg_auth_members m
       join pg_catalog.pg_roles r on r.oid = m.roleid
       join pg_catalog.pg_roles u on u.oid = m.member
       where r.rolname = '${worker}' and u.rolname = current_user
         and (m.set_option or m.inherit_option)`,
    );
    expect(held.rows).toEqual([{ held: 0 }]);
    const where = await owner.query(
      `select n.nspname as schema, pg_catalog.pg_get_userbyid(c.relowner)::text as owner
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.relname = 'rq_clash' order by 1`,
    );
    expect(where.rows).toEqual([
      { schema: 'pgboss', owner: worker },
      { schema: 'public', owner: ownerName },
    ]);
    await as(workerUrl, 'drop table pgboss.rq_clash');
    await owner.exec('drop table public.rq_clash');
    expect(await workerCheck()).toEqual([]);
  });

  it('(T-491) the owner here may not grant a predefined role, so that refusal is proved on PGlite', async () => {
    await expect(owner.exec(`grant pg_write_all_data to ${web}`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

/** T-495's words, as the checks print them. */
const foreignKey = (from: string, key: string, to: string, holder: string, statement: string) =>
  `${from}, which no migration made, has a foreign key ${key} on ${to}, which they made, so a change to a league's rows there may run what ${holder} put on ${from} (a cascade into a trigger), and ${holder} may test which rows exist past the league fence (T-495): ${statement}`;
const referenceRight = (holders: string, table: string) =>
  `${holders} may reference ${table}, which the migrations made, or put a trigger on it, which no migration grants, so a table no migration made may hang on a league's rows (T-495): revoke references, trigger on table ${table} from ${holders} cascade`;
const schemaRight = (holders: string, schema: string) =>
  `${holders} may use the schema ${schema}, which the migrations made and grant only to the website's roles, and ${holders} is the job queue's or reached only by the worker's login, so the worker may reach or make there what hangs on a league's rows (T-495): revoke usage, create on schema ${schema} from ${holders} cascade`;

describe('the confirming look’s attacks, refused by name and mended as printed (T-495, T-496)', () => {
  it('(T-495) the website’s start refuses a cascade table in pgboss with a definer trigger hung on sign_in.code_requests', async () => {
    await owner.exec(
      `grant usage on schema sign_in to ${worker}; grant references on sign_in.code_requests to ${worker}`,
    );
    await as(
      workerUrl,
      `create table pgboss.rq_lk_job (note text);
       create table pgboss.rq_cr_ref (id uuid references sign_in.code_requests (id) on delete cascade);
       create function pgboss.rq_on_gone() returns trigger language plpgsql security definer
         set search_path = pg_catalog
         as $f$ begin insert into pgboss.rq_lk_job values ('gone'); return null; end $f$;
       create trigger gone after delete on pgboss.rq_cr_ref
         for each row execute function pgboss.rq_on_gone();
       revoke execute on function pgboss.rq_on_gone() from public`,
    );
    const said = await webCheck();
    expect(said).toEqual([
      `${web} may change pgboss.rq_cr_ref (a change to sign_in.code_requests reaches it through a foreign key's action, T-495), whose trigger gone runs pgboss.rq_on_gone(), a security-definer function that is not on the reviewed list, so a change there may reach past the league fence or into the job queue: ${asWorker('drop trigger gone on pgboss.rq_cr_ref')}`,
      foreignKey(
        'pgboss.rq_cr_ref',
        'rq_cr_ref_id_fkey',
        'sign_in.code_requests',
        worker,
        asWorker('alter table pgboss.rq_cr_ref drop constraint rq_cr_ref_id_fkey'),
      ),
      referenceRight(worker, 'sign_in.code_requests'),
      schemaRight(worker, 'sign_in'),
    ]);
    for (const problem of said) await owner.exec(statementOf(problem));
    expect(await webCheck()).toEqual([]);
    // The worker may use pgboss, so its start names the definer function itself (T-499).
    const definer = `${worker} may run, or use the schema of, pgboss.rq_on_gone(), a security-definer function that is not on the reviewed list, so it may read past the league fence, whoever may run it (T-499): ${asWorker('alter function pgboss.rq_on_gone() security invoker')}`;
    expect(await workerCheck()).toEqual([definer]);
    await owner.exec(statementOf(definer));
    expect(await workerCheck()).toEqual([]);
    await as(
      workerUrl,
      'drop table pgboss.rq_cr_ref, pgboss.rq_lk_job; drop function pgboss.rq_on_gone()',
    );
  });

  it('(T-495) both starts refuse a REFERENCES right on public.games given to app_user', async () => {
    await owner.exec('grant references on public.games to app_user');
    const sentence = referenceRight('app_user', 'public.games');
    expect(await webCheck()).toEqual([sentence]);
    expect(await workerCheck()).toEqual([sentence]);
    await owner.exec(statementOf(sentence));
    expect(await webCheck()).toEqual([]);
    expect(await workerCheck()).toEqual([]);
  });

  it('(T-495) the worker’s start refuses a pgboss table with a foreign key on public.games', async () => {
    await owner.exec(`grant references (id) on public.games to ${worker}`);
    await as(workerUrl, 'create table pgboss.rq_game_ref (game uuid references public.games (id))');
    const said = await workerCheck();
    expect(said).toEqual([
      foreignKey(
        'pgboss.rq_game_ref',
        'rq_game_ref_game_fkey',
        'public.games',
        worker,
        asWorker('alter table pgboss.rq_game_ref drop constraint rq_game_ref_game_fkey'),
      ),
      referenceRight(worker, 'public.games'),
    ]);
    for (const problem of said) await owner.exec(statementOf(problem));
    expect(await workerCheck()).toEqual([]);
    expect(await webCheck()).toEqual([]);
    await as(workerUrl, 'drop table pgboss.rq_game_ref');
  });

  it('(T-496) the website holding the worker’s login by ADMIN only: each printed text, run, takes the website’s reach and the worker still starts', async () => {
    await as(workerUrl, 'create table pgboss.rq_own (id int)');
    await owner.exec(`grant ${worker} to ${web} with admin true, inherit false, set false`);
    await as(webUrl, `grant ${worker} to ${web} with set true`);
    const said = await webCheck();
    expect(said).toContainEqual(
      `${web} may become ${worker}, which owns a table (pgboss.rq_own): revoke ${worker} from ${web} cascade`,
    );
    expect(said).toContainEqual(
      `${web} is a member of queue_owner through ${worker}, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke ${worker} from ${web} cascade`,
    );
    expect(said.join(' ')).not.toMatch(/revoke queue_owner from/);
    for (const problem of said) await oneAtATime(statementOf(problem));
    expect(await webCheck()).toEqual([]);
    expect(await workerCheck()).toEqual([]);
    await as(workerUrl, 'drop table pgboss.rq_own');
  });
});

describe('the second confirming look’s attacks, refused by name and mended as printed (T-499, T-495)', () => {
  it('(T-499) the website’s start refuses a definer transition function it may not run, reached through another role’s aggregate', async () => {
    const step = `${agg}.peek_step(state bigint, v integer)`;
    await owner.exec(
      `create schema ${agg};
       grant usage on schema ${agg} to app_user;
       create function ${agg}.peek_step(state bigint, v integer) returns bigint
         language sql security definer set search_path = pg_catalog
         as 'select state + (select count(*) from public.programs)';
       revoke execute on function ${agg}.peek_step(bigint, integer) from public;
       create role ${aggOwner} nologin;
       grant usage, create on schema ${agg} to ${aggOwner};
       grant execute on function ${agg}.peek_step(bigint, integer) to ${aggOwner};
       grant ${aggOwner} to current_user with set true;
       set role ${aggOwner};
       create aggregate ${agg}.peek_all(integer) (sfunc = ${agg}.peek_step, stype = bigint, initcond = '0');
       reset role;
       revoke ${aggOwner} from current_user`,
    );
    // The plant is real: the website may not run the function, but through the aggregate,
    // whose owner PostgreSQL checks instead, it runs as the function's owner.
    await expect(as(webUrl, `select ${agg}.peek_step(0, 1)`)).rejects.toThrow(/permission denied/);
    await as(webUrl, `select ${agg}.peek_all(1)`);
    const said = await webCheck();
    expect(said).toEqual([
      `${web} may run, or use the schema of, ${step}, a security-definer function that is not on the reviewed list, so it may read past the league fence, whoever may run it (T-499): alter function ${step} security invoker`,
    ]);
    for (const problem of said) await owner.exec(statementOf(problem));
    expect(await webCheck()).toEqual([]);
    expect(await workerCheck()).toEqual([]);
    await owner.exec(`drop schema ${agg} cascade; drop role ${aggOwner}`);
  });

  it('(T-495) both starts refuse a TRIGGER right alone on public.programs given to app_user', async () => {
    await owner.exec('grant trigger on public.programs to app_user');
    const sentence = referenceRight('app_user', 'public.programs');
    expect(await webCheck()).toEqual([sentence]);
    expect(await workerCheck()).toEqual([sentence]);
    await owner.exec(statementOf(sentence));
    expect(await webCheck()).toEqual([]);
    expect(await workerCheck()).toEqual([]);
  });
});
