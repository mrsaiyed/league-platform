// The worker on the test copy (step 2.204, record 098): each email to a made-up address is
// kept in the database, as the app's role, in place of files on the host (EMAIL_CAPTURE_DIR
// is not used in staging); one to any other address is not kept, and the log says so by
// its kind only: no address, no code, no link in any line.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as database from '@srleagues/database';
import { createLogger, memorySink } from '@srleagues/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { wireWorker } from './wire-worker.ts';

let made: database.MadeUpDatabase;
let folder: string;
beforeAll(async () => {
  made = await database.madeUpDatabase();
  folder = mkdtempSync(path.join(tmpdir(), 'worker-capture-'));
});
afterAll(async () => {
  await made.close();
  rmSync(folder, { recursive: true, force: true });
});

const email = (to: string) => ({
  from: 'Leagues <leagues@mail.example.test>',
  to,
  subject: 'You are invited',
  html: '<p>Join</p>',
  text: 'Join here: https://staging.example.test/invite/made-up-token-77',
  idempotencyKey: `invite-${to}`,
});

describe('wireWorker in staging', () => {
  it('keeps made-up addresses in the database, writes no file, logs no address or link', async () => {
    const memory = memorySink();
    const worker = wireWorker(
      {
        appEnv: 'staging',
        database: made.source,
        resendApiKey: 're_made_up_key',
        captureDirectory: folder,
        siteOrigin: 'https://staging.example.test',
        sendingAddress: 'leagues@mail.example.test',
      },
      createLogger({ sink: memory.sink }),
    );
    try {
      expect(worker.emailKind).toBe('capture');
      await worker.email.send(email('invited.coach@example.test'));
      await worker.email.send(email('person@gmail.com'));
    } finally {
      await worker.close().catch(() => {});
    }
    expect(existsSync(folder) ? readdirSync(folder) : []).toEqual([]);
    const lines = memory.lines.join('\n');
    for (const secret of [
      'invited.coach',
      'gmail',
      'made-up-token-77',
      'staging.example.test/invite',
    ]) {
      expect(lines).not.toContain(secret);
    }
    expect(lines).toContain('worker.email_not_kept');
    // Told once, for the address that is not made up; the made-up one was kept.
    expect(lines.match(/worker\.email_not_kept/g)).toHaveLength(1);
    expect(lines).toContain('not-made-up');
  });
});
