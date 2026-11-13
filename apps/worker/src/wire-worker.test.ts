// Which queue and email sender each environment gets (record 012, T-140). Nothing
// here connects: the database address is made up and nothing is started.
import { describe, expect, it, vi } from 'vitest';
import { reportQueueError, wireWorker } from './wire-worker.ts';

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
      const worker = wireWorker({ appEnv, database, resendApiKey: 're_made_up_key', ...site });
      expect({ queue: worker.queue.kind, email: worker.emailKind }).toEqual({
        queue: 'table',
        email: 'capture',
      });
      expect(Object.keys(worker.handlers)).toEqual(['email.send']);
      await worker.close();
    }
  });

  it('uses pg-boss in staging, still capturing email', async () => {
    const worker = wireWorker({
      appEnv: 'staging',
      database,
      resendApiKey: 're_made_up_key',
      ...site,
    });
    expect({ queue: worker.queue.kind, email: worker.emailKind }).toEqual({
      queue: 'pg-boss',
      email: 'capture',
    });
    await worker.close();
  });

  it('uses pg-boss and Resend in production', async () => {
    const worker = wireWorker({
      appEnv: 'production',
      database,
      resendApiKey: 're_made_up_key',
      ...site,
    });
    expect({ queue: worker.queue.kind, email: worker.emailKind }).toEqual({
      queue: 'pg-boss',
      email: 'resend',
    });
    await worker.close();
  });

  it('refuses production without an email key, before opening anything', () => {
    expect(() => wireWorker({ appEnv: 'production', database, ...site })).toThrow('RESEND_API_KEY');
  });

  it('refuses an origin or sending address the emails cannot use, before opening anything', () => {
    const local = { appEnv: 'local', database } as const;
    expect(() => wireWorker({ ...local, ...site, siteOrigin: 'leagues.example.test' })).toThrow(
      'site origin',
    );
    expect(() =>
      wireWorker({ ...local, ...site, sendingAddress: 'Leagues <a@example.test>' }),
    ).toThrow('sending address');
  });
});

describe('reportQueueError', () => {
  it('writes the kind and a fixed code, never the message', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      reportQueueError(new TypeError('could not reach someone@example.test'));
      const line = { event: 'worker.queue_error', kind: 'TypeError', code: 'unexpected' };
      expect(write).toHaveBeenCalledWith(`${JSON.stringify(line)}\n`);
      expect(JSON.stringify(write.mock.calls)).not.toContain('example.test');
    } finally {
      write.mockRestore();
    }
  });
});
