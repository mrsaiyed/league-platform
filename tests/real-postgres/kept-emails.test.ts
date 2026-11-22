// The test copy's kept emails on a real PostgreSQL (step 2.204, record 098), with the
// logins made as on the test copy: app_login may only add through public.keep_email, a
// made-up address only, the newest 300 kept; it cannot read, change or remove a row, as
// itself or as app_user; the tables' owner reads, through the script's own path
// (openLeagueMakingTarget's migration login, newestKeptEmail, keptEmailAnswer).
import { readFileSync } from 'node:fs';
import {
  connectPostgresDriver,
  createDatabaseSignInStore,
  keepEmail,
  keepFailureOf,
  newestKeptEmail,
  openLeagueMakingTarget,
} from '@srleagues/database';
import { createSupabaseSignIn, keptEmailAnswer, serveFakeSupabaseAuth } from '@srleagues/providers';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { onlineEmailSender } from '../../apps/web/src/server/online-email.ts';
import { createSignInMail } from '../../apps/web/src/server/sign-in/sign-in-mail.ts';
import { appDatabase, ca, fresh, ownerSession, server } from './server.ts';

const db = appDatabase(2);
afterAll(() => db.close());

describe('kept emails, as app_login', () => {
  it('keeps one to a made-up address, which the script’s path reads as the owner', async () => {
    const to = `owner-${fresh()}@example.test`;
    await keepEmail(db, { to, subject: 'Your sign-up code', text: 'Your code is 482913.' });
    const opened = await openLeagueMakingTarget({
      kind: 'hosted',
      migration: { url: server.ownerUrl, ca },
      app: { url: server.appUrl, ca },
    });
    if (!opened.ok) throw new Error(`not opened: ${opened.problem.kind}`);
    try {
      const kept = await newestKeptEmail(opened.target.login, to.toUpperCase());
      expect(keptEmailAnswer(kept ?? { kind: 'link', text: '' })).toEqual({
        kind: 'code',
        value: '482913',
      });
    } finally {
      await opened.target.close();
    }
  });

  it('a sign-up code the app kept, read by the owner and typed back in, finishes the sign-up', async () => {
    // The real sign-in flow: the adapter speaking to the fake Supabase Auth on 127.0.0.1,
    // the sign-in store and staging's code email both written as app_login.
    const secretKey = 'sb_secret_fake_for_tests_only';
    const auth = await serveFakeSupabaseAuth({ secretKey });
    const notKept: string[] = [];
    try {
      const mail = createSignInMail({
        sender: onlineEmailSender({ appEnv: 'staging' }, { keepEmail, keepFailureOf }, db, (kind) =>
          notKept.push(kind),
        ),
        fromAddress: 'hello@example.test',
        siteOrigin: 'https://staging.example.test',
        onNoticeFailed: () => {},
        now: () => new Date(),
      });
      const signIn = createSupabaseSignIn({
        projectUrl: auth.url,
        secretKey,
        fetch: (url, init) => fetch(url, init),
        store: createDatabaseSignInStore({ db }),
        codeSender: mail.codeSender,
        returnOrigins: ['https://staging.example.test'],
        allowLocalHttp: true,
      });
      const email = `founder-${fresh()}@example.test`;
      const networkAddress = '192.0.2.10';
      expect((await signIn.startSignUp({ email, networkAddress })).ok).toBe(true);
      const owner = await ownerSession();
      let answer: ReturnType<typeof keptEmailAnswer> = null;
      try {
        // The code email is handed over without waiting (T-68): read once it is kept.
        await vi.waitFor(async () => {
          const kept = await newestKeptEmail(owner, email);
          answer = keptEmailAnswer(kept ?? { kind: 'link', text: '' });
          expect(answer).not.toBeNull();
        });
      } finally {
        await owner.close();
      }
      const code = (answer as ReturnType<typeof keptEmailAnswer>)?.value ?? '';
      expect(code).toBe(auth.codeFor(email));
      const proved = await signIn.verifyCode({ email, code, networkAddress });
      if (!proved.ok) expect.fail(`the code was not taken: ${proved.error.code}`);
      const done = await signIn.setPassword({
        proof: proved.value.proof,
        password: 'correct horse battery',
        device: { deviceId: 'device-laptop-0000000001', label: 'Firefox', networkAddress },
      });
      if (!done.ok) expect.fail(`the sign-up did not finish: ${done.error.code}`);
      expect(done.value.outcome).toBe('account-created');
      expect(done.value.session.accessToken).toMatch(/\S/);
      expect(notKept).toEqual([]);
    } finally {
      await auth.close();
    }
  });

  it('is refused an address that is not made up, and writes nothing', async () => {
    const error = await keepEmail(db, {
      kind: 'code',
      to: `real-${fresh()}@gmail.com`,
      subject: 's',
      text: 't',
    }).catch((e: unknown) => e);
    expect(keepFailureOf(error)).toBe('refused');
    expect((error as { code?: string }).code).toBe('23514');
  });

  it('is refused an email too long for the table, the error holding no part of it', async () => {
    const to = `long-${fresh()}@example.test`;
    for (const email of [
      { to: `${'a'.repeat(320)}@example.test`, subject: 'Your code is 482913', text: 't' },
      { to, subject: `Your code is 482913 ${'x'.repeat(1000)}`, text: 't' },
      { to, subject: 's', text: `Your code is 482913 ${'x'.repeat(100000)}` },
    ]) {
      const error = (await keepEmail(db, { kind: 'code', ...email }).catch((e: unknown) => e)) as {
        code?: string;
        message?: string;
        detail?: string;
      };
      expect(error.code).toBe('22001');
      expect(keepFailureOf(error)).toBe('refused');
      for (const part of [error.message ?? '', error.detail ?? '']) {
        expect(part).not.toMatch(/482913|example\.test|xxxx|aaaa/);
      }
    }
  });

  it('the SQL made-up check gives the shared list’s answers here too', async () => {
    const cases = JSON.parse(
      readFileSync(
        new URL('../../packages/providers/src/email/made-up-address-cases.json', import.meta.url),
        'utf8',
      ),
    ) as readonly { readonly address: string; readonly madeUp: boolean }[];
    const owner = await ownerSession();
    try {
      const answers: [string, boolean][] = [];
      for (const { address } of cases) {
        const { rows } = await owner.query<{ made_up: boolean }>(
          'select kept_emails.is_made_up_address($1) as made_up',
          [address],
        );
        answers.push([address, rows[0]?.made_up ?? false]);
      }
      expect(answers).toEqual(cases.map((c) => [c.address, c.madeUp]));
    } finally {
      await owner.close();
    }
  });

  it('cannot read, change or remove a row, as itself or as app_user', async () => {
    const statements = [
      'select * from kept_emails.emails',
      "update kept_emails.emails set subject = 'x'",
      'delete from kept_emails.emails',
    ];
    const itself = await connectPostgresDriver(server.appUrl, { ca });
    try {
      for (const statement of statements) {
        await expect(itself.query(statement)).rejects.toMatchObject({ code: '42501' });
      }
      // As every transaction of the app runs (withTransaction's `set local role`).
      await itself.query('set role app_user');
      for (const statement of statements) {
        await expect(itself.query(statement)).rejects.toMatchObject({ code: '42501' });
      }
    } finally {
      await itself.close();
    }
  });

  it('keeps only the newest 300', async () => {
    const word = fresh();
    for (let i = 0; i < 305; i += 1) {
      await keepEmail(db, {
        kind: 'code',
        to: `trim-${word}@example.test`,
        subject: `n${i}`,
        text: 't',
      });
    }
    const owner = await ownerSession();
    try {
      const { rows } = await owner.query<{ n: number; oldest: string }>(
        `select count(*)::int as n,
                (select subject from kept_emails.emails where to_address = $1 order by id limit 1) as oldest
         from kept_emails.emails`,
        [`trim-${word}@example.test`],
      );
      expect(rows[0]).toEqual({ n: 300, oldest: 'n5' });
    } finally {
      await owner.close();
    }
  });
});
