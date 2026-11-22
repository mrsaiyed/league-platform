// keepEmail and newestKeptEmail on PGlite (step 2.204): written as the app, read as the
// tables' owner. The SQL guards themselves: schema/kept-emails.test.ts.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { keepEmail, keepFailureOf } from './keep-email.ts';
import { newestKeptEmail } from './newest-kept-email.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = new PGlite();
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(run.error.message);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('keepEmail and newestKeptEmail', () => {
  it('keeps as the app and reads the newest for one address as the owner', async () => {
    await keepEmail(db, {
      kind: 'code',
      to: 'A@example.test',
      subject: 'first',
      text: 'code 111111',
    });
    await keepEmail(db, {
      kind: 'code',
      to: 'b@example.test',
      subject: 'other',
      text: 'code 222222',
    });
    await keepEmail(db, {
      kind: 'code',
      to: 'a@example.test',
      subject: 'second',
      text: 'code 333333',
    });
    const read = await newestKeptEmail(pgliteDriver(pglite), ' A@Example.test ');
    expect(read).toMatchObject({ subject: 'second', text: 'code 333333' });
    expect(read?.keptAt).toBeInstanceOf(Date);
    expect(await newestKeptEmail(pgliteDriver(pglite), 'c@example.test')).toBeNull();
  });

  it('keeps an address in the form the check sees, so its final dot or spaces never hide it', async () => {
    await keepEmail(db, {
      kind: 'code',
      to: '\tDot@X.test. ',
      subject: 'dot',
      text: 'code 444444',
    });
    const { rows } = await pgliteDriver(pglite).query<{ to_address: string }>(
      'select to_address from kept_emails.emails order by id desc limit 1',
    );
    expect(rows[0]?.to_address).toBe('dot@x.test');
    for (const asked of ['dot@x.test', 'Dot@X.test.', ' dot@x.test. ']) {
      expect(await newestKeptEmail(pgliteDriver(pglite), asked)).toMatchObject({ subject: 'dot' });
    }
  });

  it('a refused address is told as refused, by its code only', async () => {
    const error = await keepEmail(db, {
      kind: 'code',
      to: 'real@gmail.com',
      subject: 's',
      text: 't',
    }).catch((e: unknown) => e);
    expect(keepFailureOf(error)).toBe('refused');
    expect(keepFailureOf(new Error('connection lost'))).toBe('fault');
  });
});
