// The league fence (T-61) on a real PostgreSQL, through app_login, as the app reaches
// it (step 2.202). Two made-up leagues are made through the league-making tool's hosted
// path. PGlite has one session, so what only many connections at once can show is here:
// each transaction keeps its own league, and nothing carries to the next one.
//
// The planted fault (the fence off on one table) is in planted-fault.test.ts, which runs
// this file with it and sees it fail.
import { withTransaction } from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fenceFaults,
  rowsBeyondLeague,
  sessionFacts,
  visibleLeagueIds,
} from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';
import { appDatabase, fresh, makeMadeUpLeague } from './server.ts';

const db = appDatabase(2);
let a: string;
let b: string;
beforeAll(async () => {
  a = await makeMadeUpLeague(`alpha-${fresh()}`);
  b = await makeMadeUpLeague(`bravo-${fresh()}`);
});
afterAll(() => db.close());

/** Resolves for each caller once `count` callers are waiting: all are inside at once. */
function meetingPoint(count: number) {
  let waiting = 0;
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return () => {
    waiting += 1;
    if (waiting === count) open();
    return opened;
  };
}

describe('the league fence through app_login', () => {
  it('is on and forced on every table in public', async () => {
    expect(await withTransaction(db, {}, fenceFaults)).toEqual([]);
  });

  it('with no league set, sees no league and no row of any table', async () => {
    const seen = await withTransaction(db, {}, async (scope) => ({
      facts: await sessionFacts(scope),
      leagues: await visibleLeagueIds(scope),
      rows: await rowsBeyondLeague(scope, null),
    }));
    expect(seen.facts).toMatchObject({ role: 'app_user', leagueId: '', accountId: '' });
    expect(seen.leagues).toEqual([]);
    expect(seen.rows).toEqual([]);
  });

  it('in league A, sees league A only, and no row of B in any table', async () => {
    for (const [league, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const seen = await withTransaction(db, { leagueId: league }, async (scope) => ({
        leagues: await visibleLeagueIds(scope),
        rows: await rowsBeyondLeague(scope, league),
      }));
      expect(seen.leagues).toEqual([league]);
      expect(seen.leagues).not.toContain(other);
      expect(seen.rows).toEqual([]);
    }
  });

  it('two connections at once each keep their own league', async () => {
    const meet = meetingPoint(2);
    const inLeague = (league: string) =>
      withTransaction(db, { leagueId: league }, async (scope) => {
        const before = await sessionFacts(scope);
        // Both transactions are open here, each on its own connection.
        await meet();
        const after = await sessionFacts(scope);
        return { before, after, leagues: await visibleLeagueIds(scope) };
      });
    const [inA, inB] = await Promise.all([inLeague(a), inLeague(b)]);
    expect(inA.before.connection).not.toBe(inB.before.connection);
    expect(inA.after).toEqual(inA.before);
    expect(inB.after).toEqual(inB.before);
    expect(inA.after.leagueId).toBe(a);
    expect(inB.after.leagueId).toBe(b);
    expect(inA.leagues).toEqual([a]);
    expect(inB.leagues).toEqual([b]);
  });

  it('a connection handed on to the next transaction carries no league with it', async () => {
    const used = new Set<number>();
    for (const league of [a, b, a, b]) {
      const facts = await withTransaction(db, { leagueId: league }, sessionFacts);
      used.add(facts.connection);
    }
    // The pool holds two connections, so each was used again here.
    for (let i = 0; i < 4; i += 1) {
      const seen = await withTransaction(db, {}, async (scope) => ({
        facts: await sessionFacts(scope),
        leagues: await visibleLeagueIds(scope),
      }));
      expect(used.has(seen.facts.connection)).toBe(true);
      expect(seen.facts).toMatchObject({ role: 'app_user', leagueId: '', accountId: '' });
      expect(seen.leagues).toEqual([]);
    }
  });
});
