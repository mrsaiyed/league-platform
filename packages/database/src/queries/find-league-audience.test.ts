// Who plays in the scope's league (R-15), read from the league's own row: adult, youth or
// mixed as the league says, and youth, the careful reading, for a league whose row cannot
// be read (here, one that is not there). The column admits no other value (0003), so a
// league cannot be made with an audience this code does not know.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { madeUpDatabase, type MadeUpDatabase } from '../seed/made-up-database.ts';
import { findLeagueAudience } from './find-league-audience.ts';

let made: MadeUpDatabase;
let db: DatabaseHandle;
beforeAll(async () => {
  made = await madeUpDatabase({ audiences: { 'maple-street': 'mixed' } });
  db = createDatabase(made.source);
}, 60_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

const audienceIn = (leagueId: string) =>
  withTransaction(db, { leagueId }, (scope) => findLeagueAudience(scope));
const idOf = (slug: string) => made.leagues.find((l) => l.slug === slug)?.leagueId ?? '';

describe('findLeagueAudience', () => {
  it("reads the league's own audience", async () => {
    expect(await audienceIn(idOf('lakeside'))).toBe('adult');
    expect(await audienceIn(idOf('maple-street'))).toBe('mixed');
  });

  it('reads a league whose row cannot be read as youth', async () => {
    expect(await audienceIn(randomUUID())).toBe('youth');
  });
});
