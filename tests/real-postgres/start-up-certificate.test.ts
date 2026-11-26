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
import type { DatabaseHandle, DatabaseSource } from '@srleagues/database';
import { createLogger, memorySink } from '@srleagues/observability';
import type { EmailConfirmationQuestion, SignInService } from '@srleagues/providers';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../apps/web/src/server/config-schema.ts';
import { startWebApp, type DatabasePackage } from '../../apps/web/src/server/startup.ts';
import { loadWorkerConfig } from '../../apps/worker/src/config-schema.ts';
import { startWorker } from '../../apps/worker/src/start-worker.ts';
import { appDatabase, ca, ownerSession, server } from './server.ts';

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
      // The connection is made and the login role read; what may still stop it is the
      // next check, pg-boss's schema, which the release makes and 2.202's server does not
      // have yet (record 053). Once it does, the worker starts.
      expect(said).toMatch(
        /^(started|WorkerStartError: The worker cannot start: the database login role is not fit for the worker \(T-60, T-257\): the pgboss schema)/,
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

// Step 2.238's second fix round (T-482): the release shape of record 053, as it stands
// today. pg-boss's schema is a reviewed library schema, so its own tables are let be by
// the fence check and nothing ever says to drop them. What still refuses every start after
// the first is the older T-60 check, unchanged: pg-boss makes its tables as the worker's
// login, which then owns tables (or, reassigned, may become the role that owns them).
// Step 2.112 is where that is solved; this test asserts what T-60 says today.
describe('the release shape of record 053 (T-482, step 2.238)', () => {
  it('starts the worker once; then only T-60 refuses, and nothing says to drop pg-boss’s tables', async () => {
    const owner = await ownerSession();
    const db = appDatabase(1);
    const release = [
      'create role queue_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
      'grant queue_owner to current_user',
      'create schema pgboss authorization queue_owner',
      'revoke all on schema pgboss from public',
      'grant queue_owner to app_login',
    ];
    const ownsTables =
      /^app_login owns tables \(pgboss\.\w+ and \d+ more\), so it could switch their fence off: reassign owned by app_login to postgres$/;
    const mayBecomeOwner =
      /^app_login may become queue_owner, which owns tables \(pgboss\.\w+ and \d+ more\): revoke queue_owner from app_login$/;
    try {
      for (const statement of release) await owner.exec(statement);
      expect(await workerSays(server.appUrl, ca)).toMatch(/^started\n/);
      const after = await databasePackage.checkLoginRole(db);
      expect(after).toEqual([expect.stringMatching(ownsTables)]);
      for (const said of [
        await workerSays(server.appUrl, ca),
        await webSays(server.appUrl, ca),
        after.join('\n'),
      ]) {
        expect(said).toContain('app_login owns tables (pgboss.');
        expect(said).not.toMatch(/drop (table|view) pgboss/);
      }
      // Reassigned to the schema's owner, as a release might try: T-60 still refuses.
      const login = await databasePackage.connectPostgresDriver(server.appUrl, { ca });
      try {
        await login.exec('reassign owned by app_login to queue_owner');
      } finally {
        await login.close();
      }
      const reassigned = await databasePackage.checkLoginRole(db);
      expect(reassigned).toEqual([expect.stringMatching(mayBecomeOwner)]);
    } finally {
      await db.close();
      for (const statement of [
        'drop schema if exists pgboss cascade',
        'revoke queue_owner from app_login',
        'drop role if exists queue_owner',
      ])
        await owner.exec(statement);
      await owner.close();
    }
  });
});
