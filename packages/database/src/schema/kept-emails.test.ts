// Migration 0023 (step 2.204, record 075 option 5): the test copy's kept emails. What the
// database itself promises, whoever writes: the app's role may only add through
// public.keep_email, which takes a made-up address only (record 075's list, checked here
// again) and keeps the newest 300; it cannot read, change or remove a row, nor use the
// schema. The same on the real PostgreSQL: tests/real-postgres/kept-emails.test.ts.
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asApp, freshSchema, one, refused } from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const keep = (to: string, subject = 'Your code', text = 'Your code is 123456.') =>
  asApp(db, {}, (tx) => tx.query('select public.keep_email($1, $2, $3)', [to, subject, text]));
const count = async () =>
  Number((await one<{ n: string }>(db, 'select count(*) as n from kept_emails.emails')).n);

// Record 075's list, both ways, and spellings around its edges: the one shared list, which
// packages/providers/src/email/made-up-address.test.ts holds isMadeUpAddress to as well.
const cases = JSON.parse(
  readFileSync(
    new URL('../../../providers/src/email/made-up-address-cases.json', import.meta.url),
    'utf8',
  ),
) as readonly { readonly address: string; readonly madeUp: boolean }[];

describe('kept_emails.is_made_up_address', () => {
  it('says what isMadeUpAddress says, for every spelling on the shared list', async () => {
    expect(cases.length).toBeGreaterThan(40);
    const answers: [string, boolean][] = [];
    for (const { address } of cases) {
      const { made_up } = await one<{ made_up: boolean }>(
        db,
        'select kept_emails.is_made_up_address($1) as made_up',
        [address],
      );
      answers.push([address, made_up]);
    }
    expect(answers).toEqual(cases.map((c) => [c.address, c.madeUp]));
  });
});

describe('public.keep_email, as the app', () => {
  it('keeps an email to a made-up address, in small letters', async () => {
    await keep(' New.Owner@Example.TEST ', 'Your sign-up code', 'Your code is 654321.');
    const row = await one<{ to_address: string; subject: string; body_text: string }>(
      db,
      'select to_address, subject, body_text from kept_emails.emails order by id desc limit 1',
    );
    expect(row).toEqual({
      to_address: 'new.owner@example.test',
      subject: 'Your sign-up code',
      body_text: 'Your code is 654321.',
    });
  });

  it('refuses an address that is not made up, and writes nothing', async () => {
    const before = await count();
    for (const to of ['person@gmail.com', 'x@example.com.evil.com', 'nobody']) {
      await expect(keep(to)).rejects.toMatchObject(refused.check);
    }
    await expect(keep(null as unknown as string)).rejects.toMatchObject({ code: '22004' });
    expect(await count()).toBe(before);
  });

  it('refuses an email too long for the table with an error of its own, no value in it', async () => {
    const before = await count();
    const long = (n: number) => `Your code is 482913 ${'x'.repeat(n)}`;
    for (const [to, subject, text] of [
      [`${'a'.repeat(320)}@example.test`, 'Your code is 482913', 'Your code is 482913'],
      ['new.owner@example.test', long(1000), 'Your code is 482913'],
      ['new.owner@example.test', 'Your code is 482913', long(100000)],
    ] as const) {
      const error = (await keep(to, subject, text).catch((e: unknown) => e)) as {
        code?: string;
        message?: string;
        detail?: string;
      };
      expect(error.code).toBe('22001');
      for (const part of [error.message ?? '', error.detail ?? '']) {
        expect(part).not.toMatch(/482913|example\.test|xxxx|aaaa/);
      }
    }
    expect(await count()).toBe(before);
  });

  it('keeps only the newest 300', async () => {
    for (let i = 0; i < 310; i += 1) await keep(`trim-${i}@example.test`, `n${i}`);
    expect(await count()).toBe(300);
    const { oldest } = await one<{ oldest: string }>(
      db,
      'select subject as oldest from kept_emails.emails order by id limit 1',
    );
    expect(oldest).toBe('n10');
  });
});

describe('public.keep_email, by age', () => {
  it('removes every email older than 3 days, whatever the count', async () => {
    for (const [subject, age] of [
      ['four days', '4 days'],
      ['three days and a minute', '3 days 1 minute'],
      ['two days', '2 days'],
    ] as const) {
      await db.query(
        `insert into kept_emails.emails (to_address, subject, body_text, kept_at)
         values ('aged@example.test', $1, 'Your code is 482913.', now() - $2::interval)`,
        [subject, age],
      );
    }
    await keep('fresh@example.test', 'now');
    const { rows } = await db.query<{ subject: string }>(
      "select subject from kept_emails.emails where to_address = 'aged@example.test' order by id",
    );
    expect(rows.map((r) => r.subject)).toEqual(['two days']);
  });
});

describe('what the app cannot do', () => {
  it('cannot read, add, change or remove a row, nor run the check itself', async () => {
    for (const statement of [
      'select * from kept_emails.emails',
      "insert into kept_emails.emails (to_address, subject, body_text) values ('a@example.test', 's', 't')",
      "update kept_emails.emails set subject = 'x'",
      'delete from kept_emails.emails',
      "select kept_emails.is_made_up_address('a@example.test')",
    ]) {
      await expect(asApp(db, {}, (tx) => tx.query(statement))).rejects.toMatchObject(
        refused.privilege,
      );
    }
  });

  it('rows written by the owner still pass the table’s own checks', async () => {
    await expect(
      db.query(
        "insert into kept_emails.emails (to_address, subject, body_text) values ('real@gmail.com', 's', 't')",
      ),
    ).rejects.toMatchObject(refused.check);
    await expect(
      db.query(
        "insert into kept_emails.emails (to_address, subject, body_text) values ('Big@example.test', 's', 't')",
      ),
    ).rejects.toMatchObject(refused.check);
  });
});
