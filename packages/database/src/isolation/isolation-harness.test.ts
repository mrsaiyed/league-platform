// The harness catches what it is for: planted leaky reads and writes, a leak that
// names nothing, an error naming the other league, a policy hole, a case that
// commits, a case that cannot reach its target, planted leaky commands and jobs, and
// a command refused in its own league. A refusal is not a leak, and nor is a new
// id or time; a time the rows already held is still compared.
import {
  defineCommand,
  ok,
  setLeagueName,
  type Command,
  type CommandContext,
  type CommandError,
  type CommandTx,
  type JobQueue,
  type Result,
} from '@srleagues/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withFenceSetTo } from '../db/db.test-helper.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { z } from 'zod';
import { findCurrentLeague, findProgramBySlug, listPrograms } from '../queries/index.ts';
import { harnessTx, runInScope } from './command-cases.test-helper.ts';
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

  it('does not count new ids and times as a different answer', async () => {
    const adding = planted('add a program, returning its new id and time', (scope) =>
      transactionOf(scope)
        .insertInto('programs')
        .values({
          league_id: scope.leagueId,
          slug: 'added',
          name: 'Added',
          sport_key: 'volleyball',
        })
        .returning(['id', 'created_at'])
        .execute(),
    );
    expect(await check(adding)).toEqual([]);
  });

  it('still compares times the rows already held: the latest across leagues is caught', async () => {
    await onThrowaway(async (fresh) => {
      await fresh.pglite.exec(`
        set session_replication_role = replica;
        update programs set created_at = '2030-01-01T00:00:00Z'
          where league_id = '${fresh.b.leagueId}';
        set session_replication_role = origin;`);
      const latest = planted('the newest program, in any league', async (scope) => {
        const { rows } = await sql<{
          at: Date;
        }>`select max(created_at) as at from programs`.execute(transactionOf(scope));
        return rows[0]?.at;
      });
      expect(await check(latest, fresh)).toEqual([{ run: 'code-only', problem: differs }]);
    });
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

describe('the harness, with commands (step 1.10)', () => {
  type PlantedTx = CommandTx & { scope: LeagueScope };
  const plantedTx = (scope: LeagueScope, jobs: JobQueue): PlantedTx => ({ scope, jobs });
  // A correct policy: only the owner of the context's league.
  const ownerOnly = async (context: CommandContext, _input: unknown, tx: PlantedTx) =>
    (await findCurrentLeague(tx.scope))?.ownerAccountId === context.accountId;
  const commandCase = <Tx extends CommandTx>(
    command: Command<unknown, CommandError, Tx>,
    makeTx: (scope: LeagueScope, jobs: JobQueue) => Tx,
    input: (target: LeagueRecords) => unknown,
  ): IsolationCase => ({
    subject: command,
    name: command.commandName,
    run: (scope, target) => runInScope(command, makeTx, scope, input(target)),
  });

  it('passes the real command', async () => {
    const real = commandCase(setLeagueName, harnessTx, () => ({ name: 'Renamed', version: 1 }));
    expect(await check(real)).toEqual([]);
  });

  it('catches a planted command that takes the league from its input', async () => {
    const renameNamedLeague = defineCommand({
      name: 'leagues.planted_rename',
      permission: 'league.settings',
      input: z.object({ leagueId: z.string() }),
      allowed: ownerOnly,
      // The leak: it renames the league its input names, with no league filter.
      run: async ({ input, tx }): Promise<Result<number, never>> => {
        const { rows } = await sql`update leagues set name = 'Planted'
                                   where id = ${input.leagueId} returning id`.execute(
          transactionOf(tx.scope),
        );
        return ok(rows.length);
      },
    });
    const leaky = commandCase(renameNamedLeague, plantedTx, (target) => ({
      leagueId: target.leagueId,
    }));
    expect(await check(leaky)).toEqual([
      { run: 'code-only', problem: "changed league bravo's leagues" },
      { run: 'code-only', problem: differs },
    ]);
  });

  it("catches a job that names another league's records", async () => {
    const tellAboutProgram = defineCommand({
      name: 'leagues.planted_job',
      permission: 'league.settings',
      input: z.object({ programId: z.string() }),
      allowed: ownerOnly,
      run: async ({ context, input, tx }): Promise<Result<null, never>> => {
        const ids = { program: input.programId };
        await tx.jobs.enqueue({ type: 'notify.event', leagueId: context.leagueId, ids });
        return ok(null);
      },
    });
    const leaky = commandCase(tellAboutProgram, plantedTx, (target) => ({
      programId: target.programId,
    }));
    const leak = `returned "${leagues.b.programId}" of league bravo`;
    expect(await check(leaky)).toEqual([
      { run: 'app', problem: leak },
      { run: 'code-only', problem: leak },
    ]);
  });

  it("counts an expected error in the target's own league as proving nothing", async () => {
    const stale = commandCase(setLeagueName, harnessTx, () => ({ name: 'Renamed', version: 7 }));
    expect(await check(stale)).toEqual([
      {
        run: 'control',
        problem: "refused in the target's own league: leagues.set_name refused: changed-since-read",
      },
    ]);
  });
});
