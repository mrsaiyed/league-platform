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
    await keepEmail(db, { to: 'A@example.test', subject: 'first', text: 'code 111111' });
    await keepEmail(db, { to: 'b@example.test', subject: 'other', text: 'code 222222' });
    await keepEmail(db, { to: 'a@example.test', subject: 'second', text: 'code 333333' });
    const read = await newestKeptEmail(pgliteDriver(pglite), ' A@Example.test ');
    expect(read).toMatchObject({ subject: 'second', text: 'code 333333' });
    expect(read?.keptAt).toBeInstanceOf(Date);
    expect(await newestKeptEmail(pgliteDriver(pglite), 'c@example.test')).toBeNull();
  });

  it('a refused address is told as refused, by its code only', async () => {
    const error = await keepEmail(db, { to: 'real@gmail.com', subject: 's', text: 't' }).catch(
      (e: unknown) => e,
    );
    expect(keepFailureOf(error)).toBe('refused');
    expect(keepFailureOf(new Error('connection lost'))).toBe('fault');
  });
});
