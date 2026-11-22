// The test copy's kept emails on a real PostgreSQL (step 2.204, record 098), with the
// logins made as on the test copy: app_login may only add through public.keep_email, a
// made-up address only, the newest 300 kept; it cannot read, change or remove a row, as
// itself or as app_user; the tables' owner reads, through the script's own path
// (openLeagueMakingTarget's migration login, newestKeptEmail, keptEmailAnswer).
import {
  connectPostgresDriver,
  keepEmail,
  keepFailureOf,
  newestKeptEmail,
  openLeagueMakingTarget,
} from '@srleagues/database';
import { keptEmailAnswer } from '@srleagues/providers';
import { afterAll, describe, expect, it } from 'vitest';
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
      expect(keptEmailAnswer(kept?.text ?? '')).toEqual({ kind: 'code', value: '482913' });
    } finally {
      await opened.target.close();
    }
  });

  it('is refused an address that is not made up, and writes nothing', async () => {
    const error = await keepEmail(db, {
      to: `real-${fresh()}@gmail.com`,
      subject: 's',
      text: 't',
    }).catch((e: unknown) => e);
    expect(keepFailureOf(error)).toBe('refused');
    expect((error as { code?: string }).code).toBe('23514');
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
      await keepEmail(db, { to: `trim-${word}@example.test`, subject: `n${i}`, text: 't' });
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
