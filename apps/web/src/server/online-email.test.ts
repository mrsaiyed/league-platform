// The website's email on a real database (step 2.204): in staging a sign-up code is kept
// in the database (PGlite here; the real PostgreSQL in tests/real-postgres/kept-emails),
// written as the app's role, and its words give the script's answer; production keeps
// nothing; no code, address or word reaches a log line. And the whole walk: a sign-up code
// read back as the tables' owner, typed into the real sign-in flow, makes the account.
import * as database from '@srleagues/database';
import { createSupabaseSignIn, keptEmailAnswer, serveFakeSupabaseAuth } from '@srleagues/providers';
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

function signInMail(appEnv: 'staging' | 'production', told: string[], into = db) {
  kept = [];
  const now = () => new Date('2026-11-22T10:00:00Z');
  return createSignInMail({
    sender: onlineEmailSender(
      { appEnv, resendApiKey: appEnv === 'production' ? 're_made_up_key' : undefined },
      keeping,
      into,
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
    expect(keptEmailAnswer(kept[0] ?? { kind: 'link', text: '' })).toEqual({
      kind: 'code',
      value: '482913',
    });
    expect(told).toEqual([]);
    for (const spy of lines) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('in staging a sign-up code, read as the tables’ owner and typed back in, finishes the sign-up', async () => {
    // The real sign-in flow on this computer: the real adapter speaking to the fake
    // Supabase Auth over http on 127.0.0.1, the sign-in store in a made-up database, and
    // staging's code email kept there as the app's role. Made-up keys only (T-201). Its
    // own copy of the made-up database: madeUpDatabase() hands its session to the app's
    // login for good, and a copy (PGlite's clone) starts again as the tables' owner.
    const secretKey = 'sb_secret_fake_for_tests_only';
    if (made.source.kind !== 'pglite') throw new Error('expected a PGlite database');
    // clone() is typed as the interface; what it gives is a PGlite like the one cloned.
    const pglite = (await made.source.pglite.clone()) as typeof made.source.pglite;
    const owner = database.pgliteDriver(pglite);
    const appDb = database.createDatabase({ kind: 'pglite', pglite });
    const auth = await serveFakeSupabaseAuth({ secretKey });
    try {
      const told: string[] = [];
      const mail = signInMail('staging', told, appDb);
      const signIn = createSupabaseSignIn({
        projectUrl: auth.url,
        secretKey,
        fetch: (url, init) => fetch(url, init),
        store: database.createDatabaseSignInStore({ db: appDb }),
        codeSender: mail.codeSender,
        returnOrigins: ['https://staging.example.test'],
        allowLocalHttp: true,
      });
      const email = 'founder@example.test';
      const networkAddress = '192.0.2.10';
      expect((await signIn.startSignUp({ email, networkAddress })).ok).toBe(true);
      await vi.waitFor(() => expect(kept).toHaveLength(1));
      // Read as the script reads it (newestKeptEmail), as the tables' owner: the session
      // that built this database, which the app's own transactions never become.
      const read = await database.newestKeptEmail(owner, 'Founder@Example.test');
      const answer = keptEmailAnswer(read ?? { kind: 'link', text: '' });
      expect(answer?.kind).toBe('code');
      expect(answer?.value).toBe(auth.codeFor(email));
      const proved = await signIn.verifyCode({ email, code: answer?.value ?? '', networkAddress });
      if (!proved.ok) expect.fail(`the code was not taken: ${proved.error.code}`);
      const done = await signIn.setPassword({
        proof: proved.value.proof,
        password: 'correct horse battery',
        device: { deviceId: 'device-laptop-0000000001', label: 'Firefox', networkAddress },
      });
      if (!done.ok) expect.fail(`the sign-up did not finish: ${done.error.code}`);
      expect(done.value.outcome).toBe('account-created');
      expect(done.value.accountId).toMatch(/\S/);
      expect(done.value.session.accessToken).toMatch(/\S/);
      expect(told).toEqual([]);
    } finally {
      await auth.close();
      await appDb.close();
      await pglite.close();
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
