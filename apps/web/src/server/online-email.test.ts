// The website's email on a real database (step 2.204): in staging a sign-up code is kept
// in the database (PGlite here; the real PostgreSQL in tests/real-postgres/kept-emails),
// written as the app's role, and its words give the script's answer; production keeps
// nothing; no code, address or word reaches a log line.
import * as database from '@srleagues/database';
import { keptEmailAnswer } from '@srleagues/providers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { onlineEmailSender, type KeptEmailsDatabase } from './online-email.ts';
import { createSignInMail } from './sign-in/sign-in-mail.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
});
afterAll(async () => {
  await db.close();
  await made.close();
});

/** What reached the database's keepEmail, and resolved there (written as the app's role). */
let kept: database.EmailToKeep[] = [];
const keeping: KeptEmailsDatabase = {
  keepEmail: async (handle, email) => {
    await database.keepEmail(handle, email);
    kept.push(email);
  },
  keepFailureOf: database.keepFailureOf,
};

function signInMail(appEnv: 'staging' | 'production', told: string[]) {
  kept = [];
  const now = () => new Date('2026-11-22T10:00:00Z');
  return createSignInMail({
    sender: onlineEmailSender(
      { appEnv, resendApiKey: appEnv === 'production' ? 're_made_up_key' : undefined },
      keeping,
      db,
      (kind) => told.push(kind),
    ),
    fromAddress: 'hello@example.test',
    siteOrigin: 'https://staging.example.test',
    onNoticeFailed: () => {},
    now,
  });
}

describe('onlineEmailSender', () => {
  it('in staging keeps a sign-up code, which the script’s reading finds', async () => {
    const lines = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const told: string[] = [];
    const mail = signInMail('staging', told);
    const sent = await mail.codeSender.send({
      to: 'New.Owner@example.test',
      purpose: 'sign-up',
      code: '482913',
      accountExists: false,
      expiresAt: new Date('2026-11-22T10:10:00Z'),
    });
    expect(sent.ok).toBe(true);
    // The code is handed over without waiting (T-68): read once it is kept.
    await vi.waitFor(() => expect(kept).toHaveLength(1));
    expect(kept[0]?.to).toBe('New.Owner@example.test');
    expect(keptEmailAnswer(kept[0]?.text ?? '')).toEqual({ kind: 'code', value: '482913' });
    expect(told).toEqual([]);
    for (const spy of lines) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('in staging keeps nothing for an address that is not made up, told by its kind', async () => {
    const told: string[] = [];
    await signInMail('staging', told).codeSender.send({
      to: 'person@gmail.com',
      purpose: 'sign-up',
      code: '111222',
      accountExists: false,
      expiresAt: new Date('2026-11-22T10:10:00Z'),
    });
    await vi.waitFor(() => expect(told).toEqual(['not-made-up']));
    expect(kept).toEqual([]);
  });

  it('in production sends through Resend and writes nothing', async () => {
    // No request leaves this computer: fetch answers here, and stays replaced until the
    // email has been handed to it.
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ id: 'made-up-id' })));
    try {
      await signInMail('production', []).codeSender.send({
        to: 'production.owner@example.test',
        purpose: 'sign-up',
        code: '333444',
        accountExists: false,
        expiresAt: new Date('2026-11-22T10:10:00Z'),
      });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    } finally {
      fetch.mockRestore();
    }
    expect(kept).toEqual([]);
  });
});
