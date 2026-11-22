// Opening where a league is made, on PGlite only (T-201): a folder, and PGlite served
// on this computer's own loopback address standing in for a hosted database. Every
// other address is made up and is refused before anything connects, or answers nobody.
// What the script prints from the place is tested in tests/make-league-where.test.mjs.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import {
  connectCauseOf,
  serverCodeOf,
  hostOnThisComputer,
  openLeagueMakingTarget,
  supabaseProjectOf,
  type LeagueMakingSource,
} from './league-making-target.ts';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'league-making-target-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A PGlite served on 127.0.0.1, standing in for a hosted database. */
async function served(db: PGlite) {
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  const port = Number(server.getServerConn().split(':').at(-1));
  return { server, port };
}

const hosted = (migration: string, app: string): LeagueMakingSource => ({
  kind: 'hosted',
  migration: { url: migration, ssl: 'off' },
  app: { url: app, ssl: 'off' },
});

describe('openLeagueMakingTarget on this computer', () => {
  it('refuses a folder with no database, and makes none there', async () => {
    const folder = path.join(root, 'empty');
    expect(await openLeagueMakingTarget({ kind: 'folder', folder })).toEqual({
      ok: false,
      problem: { kind: 'no-database' },
    });
    expect(await readdir(root)).toEqual([]);
  });

  it('refuses a database holding the tracker’s own schema, before reading anything else', async () => {
    const tracker = new PGlite();
    try {
      await tracker.exec('create schema live_stats');
      expect(await openLeagueMakingTarget({ kind: 'pglite', pglite: tracker })).toEqual({
        ok: false,
        problem: { kind: 'tracker-database', login: 'migration' },
      });
    } finally {
      await tracker.close();
    }
  });
});

describe('openLeagueMakingTarget on a hosted database', () => {
  it('refuses, before connecting, a database elsewhere whose certificate would not be checked', async () => {
    // Made-up hosts: nothing is looked up, since the refusal comes first.
    const elsewhere = 'postgres://made-up:made-up@db.example.test:5432/league';
    for (const source of [
      hosted(elsewhere, elsewhere),
      { ...hosted(elsewhere, elsewhere), migration: { url: elsewhere, ssl: 'no-verify' as const } },
      { ...hosted(elsewhere, elsewhere), migration: { url: elsewhere, ssl: 'verify' as const } },
    ]) {
      expect(await openLeagueMakingTarget(source)).toEqual({
        ok: false,
        problem: { kind: 'certificate-not-checked', login: 'migration' },
      });
    }
    const local = 'postgres://made-up:made-up@127.0.0.1:1/none';
    expect(
      await openLeagueMakingTarget({
        kind: 'hosted',
        migration: { url: local, ssl: 'off' },
        app: { url: elsewhere, ssl: 'verify' },
      }),
    ).toEqual({ ok: false, problem: { kind: 'certificate-not-checked', login: 'app' } });
  });

  it('refuses a hosted address with anything after "?", before connecting', async () => {
    const local = 'postgres://made-up:made-up@127.0.0.1:1/none';
    for (const tail of ['?application_name=web', '?ssl=0', '?', '#x']) {
      expect(await openLeagueMakingTarget(hosted(`${local}${tail}`, local)), tail).toEqual({
        ok: false,
        problem: { kind: 'query-string', login: 'migration' },
      });
    }
  });

  it('gives up connecting after its time limit, and says so', async () => {
    // A made-up server on this computer that takes the connection and never answers.
    const silent = createServer(() => {});
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', () => resolve()));
    const port = (silent.address() as AddressInfo).port;
    try {
      const url = `postgres://made-up:made-up@localhost:${port}/league`;
      const started = Date.now();
      expect(
        await openLeagueMakingTarget({
          kind: 'hosted',
          migration: { url, ssl: 'off', connectionTimeoutMillis: 300 },
          app: { url, ssl: 'off', connectionTimeoutMillis: 300 },
        }),
      ).toEqual({
        ok: false,
        problem: { kind: 'cannot-connect', login: 'migration', cause: 'timeout', code: null },
      });
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      silent.close();
    }
  });

  it('says which login could not connect and the likely cause, never the address', async () => {
    const nobody = 'postgres://made-up:made-up@127.0.0.1:1/none';
    expect(await openLeagueMakingTarget(hosted(nobody, nobody))).toEqual({
      ok: false,
      problem: { kind: 'cannot-connect', login: 'migration', cause: 'network', code: null },
    });
  });

  it('shows where it really connected: its host and port, and the server’s own database name', async () => {
    const db = await freshSchema();
    const { server, port } = await served(db);
    try {
      // The address names a database and a user; the place shows neither guess.
      const url = `postgres://made-up-user:made-up-secret@127.0.0.1:${port}/a_name_in_the_address`;
      const opened = await openLeagueMakingTarget(hosted(url, url));
      if (!opened.ok) throw new Error(JSON.stringify(opened.problem));
      try {
        const actual = (await db.query<{ name: string }>('select current_database() as name'))
          .rows[0]!.name;
        expect(opened.target.place).toEqual({
          kind: 'postgres',
          host: '127.0.0.1',
          port,
          database: actual,
          project: null,
          onThisComputer: true,
        });
        expect(actual).not.toBe('a_name_in_the_address');
        expect(opened.target.appLogin).toBe('own');
        expect(JSON.stringify(opened.target.place)).not.toMatch(/made-up-user|made-up-secret/);
      } finally {
        await opened.target.close();
      }
    } finally {
      await server.stop();
      await db.close();
    }
  });

  it('refuses a hosted database holding the tracker’s own schema, whatever the address says', async () => {
    const db = new PGlite();
    await db.exec('create schema live_stats');
    const { server, port } = await served(db);
    try {
      const url = `postgres://made-up:made-up@127.0.0.1:${port}/league`;
      expect(await openLeagueMakingTarget(hosted(url, url))).toEqual({
        ok: false,
        problem: { kind: 'tracker-database', login: 'migration' },
      });
    } finally {
      await server.stop();
      await db.close();
    }
  });

  it('refuses two logins that reach two different databases', async () => {
    const first = new PGlite();
    const second = new PGlite();
    const a = await served(first);
    const b = await served(second);
    try {
      expect(
        await openLeagueMakingTarget(
          hosted(
            `postgres://made-up:made-up@127.0.0.1:${a.port}/league`,
            `postgres://made-up:made-up@127.0.0.1:${b.port}/league`,
          ),
        ),
      ).toEqual({ ok: false, problem: { kind: 'not-the-same-database' } });
    } finally {
      await a.server.stop();
      await b.server.stop();
      await first.close();
      await second.close();
    }
  });
});

describe('what a connection says about itself', () => {
  it('reads the Supabase project from the direct host or the pooler’s user', () => {
    const ref = 'abcdefghijklmnopqrst';
    expect(supabaseProjectOf(`db.${ref}.supabase.co`, 'postgres')).toBe(ref);
    expect(supabaseProjectOf('aws-0-us-east-1.pooler.supabase.com', `postgres.${ref}`)).toBe(ref);
    expect(supabaseProjectOf('db.example.test', `postgres.${ref}`)).toBeNull();
    expect(supabaseProjectOf('127.0.0.1', 'postgres')).toBeNull();
  });

  it('knows this computer', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]']) {
      expect(hostOnThisComputer(host), host).toBe(true);
    }
    for (const host of [
      'db.example.test',
      '192.0.2.1',
      'localhost.example.test',
      // Another name that may lead here, another loopback address, a socket folder.
      'db.localhost',
      '127.0.0.2',
      '/var/run/postgresql',
      '',
    ]) {
      expect(hostOnThisComputer(host), host).toBe(false);
    }
  });

  it('tells the usual causes of a failed connection from their codes', () => {
    const failure = (code: string, message = 'made-up') =>
      Object.assign(new Error(message), { code });
    expect(connectCauseOf(failure('28P01'))).toBe('login');
    expect(connectCauseOf(failure('3D000'))).toBe('database');
    expect(connectCauseOf(failure('ENOTFOUND'))).toBe('host');
    expect(connectCauseOf(failure('ECONNREFUSED'))).toBe('network');
    expect(connectCauseOf(failure('SELF_SIGNED_CERT_IN_CHAIN'))).toBe('certificate');
    expect(connectCauseOf(failure('ERR_TLS_CERT_ALTNAME_INVALID'))).toBe('certificate');
    expect(connectCauseOf(new Error('The server does not support SSL connections'))).toBe('ssl');
    expect(connectCauseOf(new Error('something else'))).toBe('unknown');
    // By the code alone (step 2.203): words that speak of a certificate are not enough.
    expect(connectCauseOf(new Error('a certificate, in words only'))).toBe('unknown');
    expect(connectCauseOf(failure('UNABLE_TO_GET_ISSUER_CERT_LOCALLY'))).toBe('certificate');
    // The server answered with a code of its own: reached, and refused (fix round, 2.203).
    expect(connectCauseOf(failure('XX000', 'Tenant or user not found'))).toBe('refused');
    expect(connectCauseOf(failure('53300'))).toBe('refused');
    expect(serverCodeOf(failure('XX000'))).toBe('XX000');
    expect(serverCodeOf(failure('53300'))).toBe('53300');
    // A wrong password is still the login; Node's own codes are not the server's.
    expect(connectCauseOf(failure('28P01'))).toBe('login');
    for (const code of ['EPIPE', 'ECONNRESET', 'ETIMEDOUT', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
      expect(serverCodeOf(failure(code)), code).toBeNull();
    }
    expect(serverCodeOf(new Error('no code'))).toBeNull();
  });
});
