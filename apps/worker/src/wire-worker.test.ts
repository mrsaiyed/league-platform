// Which queue and email sender each environment gets (record 012, T-140). Nothing
// here connects: the database address is made up and nothing is started.
import { createLogger, memorySink } from '@srleagues/observability';
import { describe, expect, it } from 'vitest';
import { wireWorker } from './wire-worker.ts';

const logger = createLogger({ sink: memorySink().sink });

const database = {
  kind: 'postgres',
  url: 'postgres://app:made-up-password@localhost:5432/league_local',
  ssl: 'off',
} as const;
const site = {
  siteOrigin: 'https://leagues.example.test',
  sendingAddress: 'leagues@mail.example.test',
};

describe('wireWorker', () => {
  it('runs jobs from the table and captures email in local work and tests', async () => {
    for (const appEnv of ['local', 'test'] as const) {
      const worker = wireWorker(
        { appEnv, database, resendApiKey: 're_made_up_key', ...site },
        logger,
      );
      expect({ queue: worker.queue.kind, email: worker.emailKind }).toEqual({
        queue: 'table',
        email: 'capture',
      });
      expect(Object.keys(worker.handlers)).toEqual(['email.send', 'imports.run', 'bin.empty']);
      await worker.close();
    }
  });

  it('uses pg-boss in staging, still capturing email', async () => {
    const worker = wireWorker(
      {
        appEnv: 'staging',
        database,
        resendApiKey: 're_made_up_key',
        ...site,
      },
      logger,
    );
    expect({ queue: worker.queue.kind, email: worker.emailKind }).toEqual({
      queue: 'pg-boss',
      email: 'capture',
    });
    await worker.close();
  });

  it('uses pg-boss and Resend in production', async () => {
    const worker = wireWorker(
      {
        appEnv: 'production',
        database,
        resendApiKey: 're_made_up_key',
        ...site,
      },
      logger,
    );
    expect({ queue: worker.queue.kind, email: worker.emailKind }).toEqual({
      queue: 'pg-boss',
      email: 'resend',
    });
    await worker.close();
  });

  it('refuses production without an email key, before opening anything', () => {
    expect(() => wireWorker({ appEnv: 'production', database, ...site }, logger)).toThrow(
      'RESEND_API_KEY',
    );
  });

  it('refuses an origin or sending address the emails cannot use, before opening anything', () => {
    const local = { appEnv: 'local', database } as const;
    expect(() =>
      wireWorker({ ...local, ...site, siteOrigin: 'leagues.example.test' }, logger),
    ).toThrow('site origin');
    expect(() =>
      wireWorker({ ...local, ...site, sendingAddress: 'Leagues <a@example.test>' }, logger),
    ).toThrow('sending address');
  });
});
