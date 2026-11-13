// The harness catches what it is for: planted leaky reads and writes, a leak that
// names nothing, an error naming the other league, a policy hole, a case that
// commits, and a case that cannot reach its target. A refusal is not a leak.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withFenceSetTo } from '../db/db.test-helper.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { findProgramBySlug, listPrograms } from '../queries/index.ts';
import { findIsolationFailures } from './isolation-harness.test-helper.ts';
import type { IsolationCase } from './isolation-registry.test-helper.ts';
import { openTwoLeagues, type LeagueRecords, type TwoLeagues } from './two-leagues.test-helper.ts';

let leagues: TwoLeagues;
beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

const planted = (
  name: string,
  run: (scope: LeagueScope, target: LeagueRecords) => Promise<unknown>,
): IsolationCase => ({ subject: run, name, run });

const check = async (entry: IsolationCase, on: TwoLeagues = leagues) =>
  (await findIsolationFailures(on, [entry])).map(({ run, problem }) => ({ run, problem }));

/** Runs `test` on a database of its own, for a test that breaks it. */
async function onThrowaway<T>(test: (fresh: TwoLeagues) => Promise<T>): Promise<T> {
  const fresh = await openTwoLeagues();
  try {
    return await test(fresh);
  } finally {
    await fresh.close();
  }
}

const differs = expect.stringMatching(/^answers differently once league bravo's rows are gone/);

describe('the harness', () => {
  it('passes queries that filter to their league', async () => {
    const real = [
      planted('list', listPrograms),
      planted('find', (scope, target) => findProgramBySlug(scope, target.programSlug)),
    ];
    expect(await findIsolationFailures(leagues, real)).toEqual([]);
  });

  it('a scope set to no league, or to another, sees nothing of the league it names', async () => {
    const { db, a, b, sharedAccountId } = leagues;
    expect(await withFenceSetTo(db, {}, b.leagueId, listPrograms)).toEqual([]);
    const shared = { leagueId: a.leagueId, accountId: sharedAccountId };
    expect(await withFenceSetTo(db, shared, b.leagueId, listPrograms)).toEqual([]);
  });

  it('catches a planted query with no league filter, which only row-level security hid', async () => {
    const leaky = planted('every program', (scope) =>
      transactionOf(scope).selectFrom('programs').select(['id', 'slug']).execute(),
    );
    expect(await check(leaky)).toEqual([
      { run: 'code-only', problem: expect.stringMatching(/^returned ".+" of league bravo$/) },
      { run: 'code-only', problem: differs },
    ]);
  });

  it('catches a leak that names nothing: a count over every league', async () => {
    const leaky = planted('count programs', async (scope) => {
      const { rows } = await sql<{ n: number }>`select count(*)::int as n from programs`.execute(
        transactionOf(scope),
      );
      return rows[0]?.n;
    });
    expect(await check(leaky)).toEqual([{ run: 'code-only', problem: differs }]);
  });

  it("catches a planted write that changes another league's rows", async () => {
    const leaky = planted('rename by short name, no league filter', async (scope, target) => {
      await sql`update programs set name = 'Renamed' where slug = ${target.programSlug}`.execute(
        transactionOf(scope),
      );
      return 'done';
    });
    expect(await check(leaky)).toEqual([
      { run: 'code-only', problem: "changed league bravo's programs" },
    ]);
  });

  it('catches a planted insert into another league', async () => {
    const leaky = planted('add a program to the target', async (scope, target) => {
      await sql`insert into programs (league_id, slug, name, sport_key)
                values (${target.leagueId}, 'planted', 'Planted', 'volleyball')`.execute(
        transactionOf(scope),
      );
      return 'done';
    });
    const failures = await check(leaky);
    expect(failures).toContainEqual({
      run: 'code-only',
      problem: "changed league bravo's programs",
    });
    expect(failures.every((f) => f.run === 'code-only')).toBe(true);
  });

  it("catches a write to another league's people, outside any league table", async () => {
    const leaky = planted("rename the target's owner", async (scope, target) => {
      await sql`update accounts set display_name = 'Renamed' where id = ${target.ownerId}`.execute(
        transactionOf(scope),
      );
      return 'done';
    });
    expect(await check(leaky)).toEqual([
      { run: 'code-only', problem: 'changed accounts, outside any league' },
    ]);
  });

  it('catches a leak in every run, and a text that carries no id', async () => {
    const leaky = planted("hand back the target's short name", async (_scope, target) => ({
      [target.programSlug]: 1,
    }));
    const failures = await check(leaky);
    expect(failures.map((f) => f.run)).toEqual(['app', 'code-only', 'both-leagues', 'no-league']);
    expect(failures[0]?.problem).toBe(`returned "${leagues.b.programSlug}" of league bravo`);
  });

  it('catches an error that names the other league', async () => {
    const leaky = planted('say which program was not found', async (scope, target) => {
      const found = await findProgramBySlug(scope, target.programSlug);
      if (found === undefined) throw new Error(`no access to program ${target.programId}`);
      return found;
    });
    const failures = await check(leaky);
    expect(failures.map((f) => f.run)).toEqual(['app', 'code-only', 'both-leagues', 'no-league']);
    expect(failures[0]?.problem).toBe(
      `refused naming "no access to program ${leagues.b.programId}" of league bravo`,
    );
  });

  it('reports a case that never reaches its target, since it proves nothing', async () => {
    expect(await check(planted('aims at nothing', async () => []))).toEqual([
      { run: 'control', problem: expect.stringContaining('proves nothing') },
    ]);
  });

  it('does not count a refusal as a leak, except in the control run', async () => {
    const refusing = planted('refused unless in its own league', async (scope, target) => {
      if (scope.leagueId !== target.leagueId) throw new Error('not your league');
      return listPrograms(scope);
    });
    // Its runs that name B are stopped by row-level security.
    expect(await check(refusing)).toEqual([]);
  });

  it('reports a case that leaves its transaction unusable, instead of throwing', async () => {
    const swallowing = planted('swallows a database error', async (scope) => {
      await sql`select 1 / 0`.execute(transactionOf(scope)).catch(() => undefined);
      return null;
    });
    const failures = await check(swallowing);
    expect(failures).toHaveLength(5);
    expect(failures.every((f) => f.problem.startsWith('could not be checked'))).toBe(true);
  });

  it("catches a policy hole that lets an account's other leagues through", async () => {
    await onThrowaway(async (fresh) => {
      await fresh.pglite.exec(`
        drop policy programs_league_fence on public.programs;
        create policy programs_league_fence on public.programs
          using (league_id = (select public.current_league_id())
                 or (select public.current_account_id()) is not null)
          with check (league_id = (select public.current_league_id()));`);
      const failures = await check(planted('list', listPrograms), fresh);
      expect(failures).toEqual([
        { run: 'both-leagues', problem: expect.stringMatching(/^returned ".+" of league bravo$/) },
        { run: 'both-leagues', problem: differs },
      ]);
    });
  });

  it('catches a case that commits, changing a league for good', async () => {
    await onThrowaway(async (fresh) => {
      const committing = planted('commit, then rename', async (scope, target) => {
        const trx = transactionOf(scope);
        await sql`commit`.execute(trx);
        await sql`update programs set name = 'Kept' where id = ${target.programId}`.execute(trx);
        return 'done';
      });
      expect(await check(committing, fresh)).toContainEqual({
        run: 'afterwards',
        problem: 'programs (league bravo) changed for good: a case committed',
      });
    });
  });
});
