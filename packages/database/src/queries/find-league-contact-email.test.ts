// How people reach the scope's league (step 2.240), read from the league's own row: the
// address it was made with, and null for a league whose row cannot be read (here, one
// that is not there), so publishing waits.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { madeUpDatabase, type MadeUpDatabase } from '../seed/made-up-database.ts';
import { findLeagueContactEmail } from './find-league-contact-email.ts';

let made: MadeUpDatabase;
let db: DatabaseHandle;
beforeAll(async () => {
  made = await madeUpDatabase();
  db = createDatabase(made.source);
}, 60_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

const emailIn = (leagueId: string) =>
  withTransaction(db, { leagueId }, (scope) => findLeagueContactEmail(scope));
const idOf = (slug: string) => made.leagues.find((l) => l.slug === slug)?.leagueId ?? '';

describe('findLeagueContactEmail', () => {
  it("reads the league's own contact email", async () => {
    expect(await emailIn(idOf('lakeside'))).toMatch(/^[^@\s]+@[^@\s]+$/);
  });

  it('reads a league whose row cannot be read as having none', async () => {
    expect(await emailIn(randomUUID())).toBeNull();
  });
});
