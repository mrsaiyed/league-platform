// Step 2.203's done test on a real PostgreSQL: the web app and the worker, each in
// staging mode, open the throw-away server (encryption required, its certificate signed
// by a made-up authority) and say which of three things is wrong when they cannot:
//   - the certificate was not accepted, naming PLATFORM_DATABASE_CA: without the setting
//     (the computer's own authorities do not know the made-up one), and with a
//     certificate that is not the server's (packages/providers' made-up fixture);
//   - the login was refused: the right certificate, a wrong password;
//   - the server was not reached: a port on this computer where nothing answers.
// With the server's own certificate both get past the connection. No refusal holds the
// password, the address or a line of the certificate. Made-up data only (T-201).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import * as databasePackage from '@srleagues/database';
import type { DatabaseHandle, DatabaseSource, PostgresDriver } from '@srleagues/database';
import { createLogger, memorySink } from '@srleagues/observability';
import type { EmailConfirmationQuestion, SignInService } from '@srleagues/providers';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../apps/web/src/server/config-schema.ts';
import { startWebApp, type DatabasePackage } from '../../apps/web/src/server/startup.ts';
import { loadWorkerConfig } from '../../apps/worker/src/config-schema.ts';
import { startWorker } from '../../apps/worker/src/start-worker.ts';
import { ca, dropLogin, fresh, makeLogin, ownerSession, server } from './server.ts';

const notOurs = readFileSync(
  new URL(
    '../../packages/providers/src/platform-database/fixtures/made-up-database-ca.certificate.txt',
    import.meta.url,
  ),
  'utf8',
);

/** A port on this computer where nothing listens: one the system gave, then let go. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

const opened: DatabaseHandle[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.close();
});

/** The real database package, keeping each handle the web app opens so it is closed. */
const webDatabase = async (): Promise<DatabasePackage> => ({
  ...databasePackage,
  createDatabase: (source: DatabaseSource) => {
    const db = databasePackage.createDatabase(source);
    opened.push(db);
    return db;
  },
});

/** A sign-in stand-in that says it confirms email addresses (no sign-in service here). */
const confirming = (): SignInService =>
  ({
    emailConfirmation: async () => 'on',
  }) satisfies EmailConfirmationQuestion as unknown as SignInService;

let wrongPassword = '';
let nobodyThere = '';
beforeAll(async () => {
  const app = new URL(server.appUrl);
  app.password = 'made-up-wrong-password-2203';
  wrongPassword = app.toString();
  const gone = new URL(server.appUrl);
  gone.port = String(await freePort());
  nobodyThere = gone.toString();
});

/** A made-up tracker project (none of these addresses names one), and the file reader. */
const guard = {
  trackerProject: 'madeupprojectref0001',
  readFile: (path: string) => readFileSync(path, 'utf8'),
};

const webIn = (url: string, certificate?: string) =>
  loadConfig(
    {
      APP_ENV: 'staging',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      TRUSTED_PROXY: 'one',
      EMAIL_FROM: 'hello@example.test',
      SUPABASE_URL: 'https://made-up-project.supabase.example.test',
      SUPABASE_SECRET_KEY: 'made-up-supabase-key',
      TURNSTILE_SITE_KEY: 'made-up-turnstile-site-key',
      TURNSTILE_SECRET_KEY: 'made-up-turnstile-secret-key',
      PLATFORM_DATABASE_URL: url,
      PLATFORM_DATABASE_CA: certificate,
    },
    guard,
  );

const workerIn = async (url: string, certificate?: string) =>
  loadWorkerConfig(
    {
      APP_ENV: 'staging',
      PUBLIC_BASE_URL: 'https://leagues.example.test',
      EMAIL_FROM: 'hello@example.test',
      PLATFORM_DATABASE_URL: url,
      PLATFORM_DATABASE_CA: certificate,
      WORKER_HEALTH_PORT: String(await freePort()),
    },
    guard,
  );

async function webSays(url: string, certificate?: string): Promise<string> {
  const failure = await startWebApp(webIn(url, certificate), {
    database: webDatabase,
    realSignIn: confirming,
    log: () => {},
  }).then(
    () => 'started',
    (error: unknown) => String(error),
  );
  return failure;
}

async function workerSays(url: string, certificate?: string): Promise<string> {
  const { sink, lines } = memorySink();
  const logger = createLogger({ sink, level: 'debug', base: { app: 'worker' } });
  const said = await startWorker(await workerIn(url, certificate), { logger, pollMs: 60_000 }).then(
    async (running) => {
      await running.stop();
      return 'started';
    },
    (error: unknown) => String(error),
  );
  return `${said}\n${lines.join('\n')}`;
}

const nothingPrivate = (text: string) => {
  expect(text).not.toContain('made-up-wrong-password-2203');
  expect(text).not.toContain(new URL(server.appUrl).password);
  expect(text).not.toContain(String(new URL(server.appUrl).port));
  for (const pem of [ca, notOurs]) expect(text).not.toContain(pem.split('\n')[1]);
};

const web = {
  certificate: 'the database’s certificate was not accepted: set PLATFORM_DATABASE_CA',
  login: 'the database refused the password or login',
  notReached:
    'the database could not be reached: check the address and port in PLATFORM_DATABASE_URL',
};
const worker = {
  certificate: 'the database’s certificate was not accepted: set PLATFORM_DATABASE_CA',
  login: 'the database refused the login',
  notReached:
    'the database could not be reached: check the address and port in PLATFORM_DATABASE_URL',
};

describe('the web app in staging, on a real PostgreSQL (step 2.203)', () => {
  it('refuses naming the certificate without the setting, or with one not the server’s', async () => {
    for (const certificate of [undefined, notOurs]) {
      const said = await webSays(server.appUrl, certificate);
      expect(said).toContain(web.certificate);
      nothingPrivate(said);
    }
  });

  it('gets past the connection with the server’s own certificate, as text or a file', async () => {
    for (const certificate of [ca, server.caFile]) {
      // Every check after it passes too: the app's login is fit, and the stand-in for the
      // sign-in service says it confirms addresses.
      expect(await webSays(server.appUrl, certificate)).toBe('started');
    }
  });

  it('says the login was refused for a wrong password, and not reached with nobody there', async () => {
    const refused = await webSays(wrongPassword, ca);
    expect(refused).toContain(web.login);
    nothingPrivate(refused);
    const gone = await webSays(nobodyThere, ca);
    expect(gone).toContain(web.notReached);
    nothingPrivate(gone);
  });
});

describe('the worker in staging, on a real PostgreSQL (step 2.203)', () => {
  it('refuses naming the certificate without the setting, or with one not the server’s', async () => {
    for (const certificate of [undefined, notOurs]) {
      const said = await workerSays(server.appUrl, certificate);
      expect(said).toContain(worker.certificate);
      nothingPrivate(said);
    }
  });

  it('gets past the connection with the server’s own certificate, as text or a file', async () => {
    for (const certificate of [ca, server.caFile]) {
      const said = await workerSays(server.appUrl, certificate);
      for (const sentence of Object.values(worker)) expect(said).not.toContain(sentence);
      // The connection is made and the login role read; what stops it is the next check,
      // pg-boss's schema: 0031 made it on this server, and app_login, the website's login,
      // does not hold queue_owner (T-490). A worker login of its own starts (below).
      expect(said).toMatch(
        /^WorkerStartError: The worker cannot start: the database login role is not fit for the worker \(T-60, T-257\): the login role may not use the pgboss schema \(grant it queue_owner\)/,
      );
      nothingPrivate(said);
    }
  });

  it('says the login was refused for a wrong password, and not reached with nobody there', async () => {
    const refused = await workerSays(wrongPassword, ca);
    expect(refused).toContain(worker.login);
    nothingPrivate(refused);
    const gone = await workerSays(nobodyThere, ca);
    expect(gone).toContain(worker.notReached);
    nothingPrivate(gone);
  });
});

// Step 2.112 (T-490, record 053 as built): the job queue has its own owner. Migration 0031
// made the role queue_owner and the empty schema pgboss owned by it when this server
// started, applied by an owner made as Supabase's postgres is (not a superuser, may make
// roles), and it runs here again. The worker's login and the website's are made here as a
// hosted set-up makes them (docs/operations/new-test-copy.md): the worker's holds app_user
// and queue_owner, the website's app_user and sign_in_store (record 052), never queue_owner. pg-boss makes its tables at the worker's
// real start (startWorker, pg-boss's own start), as the worker's login.
const migration0031 = readFileSync(
  new URL('../../supabase/migrations/0031_the_job_queue_has_its_own_owner.sql', import.meta.url),
  'utf8',
);

describe('the job queue’s own owner, on a real PostgreSQL (T-490, step 2.112)', () => {
  const word = fresh();
  const names = {
    worker: `made_up_worker_${word}`,
    web: `made_up_web_${word}`,
    middle: `made_up_middle_${word}`,
    side: `made_up_side_${word}`,
  };
  const urls = { worker: '', web: '' };
  let owner: PostgresDriver;
  beforeAll(async () => {
    owner = await ownerSession();
    urls.worker = await makeLogin(owner, names.worker, ['app_user', 'queue_owner']);
    urls.web = await makeLogin(owner, names.web, ['app_user', 'sign_in_store']);
  });
  afterAll(async () => {
    // The schema's owner drops it with what is in it, whoever owns that; then each login
    // drops what it owns (pg-boss's tables) and is dropped.
    await owner.exec(`drop schema if exists ${names.side} cascade`);
    await dropLogin(owner, names.worker, urls.worker);
    await dropLogin(owner, names.web, urls.web);
    await owner.exec(`drop role if exists ${names.middle}`);
    await owner.close();
  });

  const tablesInQueue = async () =>
    (
      await owner.query<{ name: string; owner: string }>(
        `select c.relname as name, pg_catalog.pg_get_userbyid(c.relowner) as owner
           from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'pgboss' and c.relkind in ('r', 'p') order by 1`,
      )
    ).rows;

  /** What a statement run as `url`'s login says: 'done' or the server's code and message. */
  async function asLogin(url: string, statement: string): Promise<string> {
    const login = await databasePackage.connectPostgresDriver(url, { ca });
    try {
      await login.exec(statement);
      return 'done';
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      return `${String(code)} ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await login.close();
    }
  }

  /** The mending statement a refusal ends a sentence with, run as the tables' owner. */
  async function mendWith(said: string, statement: RegExp): Promise<void> {
    const found = statement.exec(said)?.[0];
    expect(found).toBeDefined();
    await owner.exec(String(found));
  }

  it('0031 runs again as the owner made like Supabase’s, which then may not act as queue_owner', async () => {
    await owner.exec(migration0031);
    const { rows: held } = await owner.query<{
      admin: boolean;
      inherit: boolean;
      set: boolean;
      by_itself: boolean;
    }>(
      `select m.admin_option as admin, m.inherit_option as inherit, m.set_option as set,
              m.grantor = m.member as by_itself
         from pg_catalog.pg_auth_members m
        where m.roleid = 'queue_owner'::regrole and m.member = current_user::regrole`,
    );
    // PostgreSQL 16 gives a role's maker ADMIN of it, from the server itself; 0031's own
    // grant to itself (SET, no INHERIT) is revoked at its end.
    expect(held).toEqual([{ admin: true, inherit: false, set: false, by_itself: false }]);
    const { rows: may } = await owner.query<{ usage: boolean; set: boolean }>(
      `select pg_catalog.pg_has_role(current_user, 'queue_owner', 'USAGE') as usage,
              pg_catalog.pg_has_role(current_user, 'queue_owner', 'SET') as set`,
    );
    expect(may).toEqual([{ usage: false, set: false }]);
    const { rows: schema } = await owner.query<{ owner: string; acl: string }>(
      `select pg_catalog.pg_get_userbyid(nspowner) as owner, nspacl::text as acl
         from pg_catalog.pg_namespace where nspname = 'pgboss'`,
    );
    expect(schema).toEqual([{ owner: 'queue_owner', acl: '{queue_owner=UC/queue_owner}' }]);
    await expect(owner.exec('create table pgboss.made_up_owners (id uuid)')).rejects.toMatchObject({
      code: '42501',
    });
    // No login but this file's worker holds queue_owner.
    const { rows: members } = await owner.query<{ name: string }>(
      `select pg_catalog.pg_get_userbyid(member) as name from pg_catalog.pg_auth_members
        where roleid = 'queue_owner'::regrole and member <> current_user::regrole`,
    );
    expect(members).toEqual([{ name: names.worker }]);
  });

  it('the website starts; the worker makes pg-boss’s tables and starts three times; the website starts again and cannot read them', async () => {
    expect(await tablesInQueue()).toEqual([]);
    expect(await webSays(urls.web, ca)).toBe('started');
    for (let start = 1; start <= 3; start += 1) {
      expect(await workerSays(urls.worker, ca)).toMatch(/^started\n/);
    }
    const tables = await tablesInQueue();
    expect(tables.map((table) => table.name)).toContain('job');
    expect(new Set(tables.map((table) => table.owner))).toEqual(new Set([names.worker]));
    // 0031 runs again with pg-boss's tables in its schema, and both still start.
    await owner.exec(migration0031);
    expect(await workerSays(urls.worker, ca)).toMatch(/^started\n/);
    expect(await webSays(urls.web, ca)).toBe('started');
    expect(await asLogin(urls.web, 'select count(*) from pgboss.job')).toBe(
      '42501 permission denied for schema pgboss',
    );
    expect(await asLogin(urls.web, 'create table pgboss.made_up_web (id uuid)')).toBe(
      '42501 permission denied for schema pgboss',
    );
    expect(await asLogin(urls.worker, 'select count(*) from pgboss.job')).toBe('done');
  });

  it('one login for both: the website refuses the worker’s, the worker the website’s', async () => {
    const asWebsite = await webSays(urls.worker, ca);
    expect(asWebsite).toContain(
      `${names.worker} is a member of queue_owner, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke queue_owner from ${names.worker}`,
    );
    expect(asWebsite).not.toMatch(/drop (table|view) pgboss/);
    expect(await workerSays(urls.web, ca)).toMatch(
      /^WorkerStartError: The worker cannot start: the database login role is not fit for the worker \(T-60, T-257\): the login role may not use the pgboss schema \(grant it queue_owner\)/,
    );
  });

  it('a website login holding queue_owner, directly or through a role between, is refused, and its statement mends it', async () => {
    const revoke = /revoke \w+ from \w+/;
    try {
      await owner.exec(`grant queue_owner to ${names.web}`);
      const direct = await webSays(urls.web, ca);
      expect(direct).toContain(
        `${names.web} is a member of queue_owner, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke queue_owner from ${names.web}`,
      );
      await mendWith(direct, revoke);
      expect(await webSays(urls.web, ca)).toBe('started');

      await owner.exec(`create role ${names.middle} nologin`);
      await owner.exec(`grant queue_owner to ${names.middle}`);
      await owner.exec(`grant ${names.middle} to ${names.web}`);
      const through = await webSays(urls.web, ca);
      expect(through).toContain(
        `${names.web} is a member of queue_owner through ${names.middle}, which owns the job queue (the pgboss schema), and the website must never read or change a queued job: revoke ${names.middle} from ${names.web}`,
      );
      await mendWith(through, revoke);
      expect(await webSays(urls.web, ca)).toBe('started');
    } finally {
      await owner.exec(`revoke queue_owner from ${names.web}`);
      await owner.exec(`drop role if exists ${names.middle}`);
    }
  });

  it('the worker is refused while it or queue_owner owns a table outside pgboss', async () => {
    await owner.exec(`create schema ${names.side}`);
    await owner.exec(`grant usage, create on schema ${names.side} to ${names.worker}, queue_owner`);
    const own = `${names.side}.made_up_kept`;
    const queues = `${names.side}.made_up_queue_kept`;
    expect(await asLogin(urls.worker, `create table ${own} (id uuid)`)).toBe('done');
    const itself = await workerSays(urls.worker, ca);
    expect(itself).toMatch(/^WorkerStartError: /);
    expect(itself).toContain(`${names.worker} owns a table (${own})`);
    expect(await asLogin(urls.worker, `drop table ${own}`)).toBe('done');
    expect(await workerSays(urls.worker, ca)).toMatch(/^started\n/);

    const made = await asLogin(
      urls.worker,
      `set role queue_owner; create table ${queues} (id uuid); reset role`,
    );
    expect(made).toBe('done');
    const through = await workerSays(urls.worker, ca);
    expect(through).toMatch(/^WorkerStartError: /);
    expect(through).toContain(`may become queue_owner, which owns a table (${queues})`);
    expect(await asLogin(urls.worker, `set role queue_owner; drop table ${queues}`)).toBe('done');
    expect(await workerSays(urls.worker, ca)).toMatch(/^started\n/);
  });
});
