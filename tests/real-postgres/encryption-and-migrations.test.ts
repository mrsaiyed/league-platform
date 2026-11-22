// The throw-away server as a stranger and as a release meet it (step 2.202): it answers
// on this computer only, encrypted only, and only to a client that checks its certificate
// against the made-up authority; and every migration is applied by the repository's own
// runner, a second run changing nothing.
import net from 'node:net';
import os from 'node:os';
import {
  applyMigrations,
  connectPostgresDriver,
  defaultMigrationsFolder,
  loadMigrations,
} from '@srleagues/database';
import { describe, expect, it } from 'vitest';
import { serverFacts } from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';
import { ca, ownerSession, server } from './server.ts';

const port = Number(new URL(server.appUrl).port);

/** Whether anything answers on `host` at the server's port. */
function answers(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 2000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

describe('where it answers, and how', () => {
  it('listens on localhost only, with encryption on', async () => {
    const session = await connectPostgresDriver(server.appUrl, { ca });
    try {
      expect(await serverFacts(session)).toMatchObject({
        listens: 'localhost',
        ssl: 'on',
        encrypted: true,
      });
      expect((await serverFacts(session)).version).toBeGreaterThanOrEqual(160000);
    } finally {
      await session.close();
    }
  });

  it('does not answer on any other address of this computer', async () => {
    expect(await answers('127.0.0.1')).toBe(true);
    const others = Object.values(os.networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => !entry.internal)
      .map((entry) => entry.address);
    const answering = [];
    for (const address of others) if (await answers(address)) answering.push(address);
    expect(answering).toEqual([]);
  });

  it('refuses a connection without encryption', async () => {
    await expect(connectPostgresDriver(server.appUrl, { ssl: 'off' })).rejects.toMatchObject({
      // 28000: no pg_hba.conf entry, no encryption.
      code: '28000',
    });
  });

  it('is refused by a client that checks its certificate without the authority’s file', async () => {
    await expect(connectPostgresDriver(server.appUrl)).rejects.toMatchObject({
      code: expect.stringMatching(/CERT|VERIFY/),
    });
  });

  it('stays encrypted when an address asks for no encryption', async () => {
    const session = await connectPostgresDriver(`${server.appUrl}?sslmode=disable&ssl=false`, {
      ca,
    });
    try {
      expect((await serverFacts(session)).encrypted).toBe(true);
    } finally {
      await session.close();
    }
  });

  it('refuses a wrong password', async () => {
    const wrong = new URL(server.appUrl);
    wrong.password = 'not-the-password';
    await expect(connectPostgresDriver(wrong.toString(), { ca })).rejects.toMatchObject({
      // 28P01: password authentication failed.
      code: '28P01',
    });
  });
});

describe('the migrations, by the repository’s own runner', () => {
  it('are all applied, and a second run changes nothing', async () => {
    const files = await loadMigrations(defaultMigrationsFolder);
    if (!files.ok) throw new Error(files.error.message);
    const owner = await ownerSession();
    try {
      const run = await applyMigrations(owner);
      expect(run).toEqual({
        ok: true,
        value: {
          applied: [],
          alreadyApplied: files.value.map((file) => file.name),
          newerInDatabase: [],
        },
      });
    } finally {
      await owner.close();
    }
  });
});
