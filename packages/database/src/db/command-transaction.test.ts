// commandTransaction turns a command's context into one fenced transaction: the
// context's league and account, set for that transaction only, as the app's role.
// It is exempt from the two-league harness (a case cannot open a transaction), so
// this file is its isolation test too.
import type { PGlite } from '@electric-sql/pglite';
import {
  defineCommand,
  fail,
  type CommandContext,
  type LeaguesTx,
  type Result,
} from '@srleagues/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { findCurrentLeague } from '../queries/index.ts';
import { freshSchema, newLeague, one, type MadeLeague } from '../schema/schema.test-helper.ts';
import { accessStore, activityLogStore, divisionsStore, leaguesStore } from '../stores/index.ts';
import { commandTransaction } from './command-transaction.ts';
import { createDatabase } from './create-database.ts';
import type { DatabaseHandle } from './database-handle.ts';
import { transactionOf, type LeagueScope } from './transaction-scope.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const noJobs = { enqueue: async () => {} };
type ScopeTx = { jobs: typeof noJobs; scope: LeagueScope };
const runner = <T>(context: CommandContext, work: (tx: ScopeTx) => Promise<T>) =>
  commandTransaction(db, (scope): ScopeTx => ({ jobs: noJobs, scope }))(context, work);
const context = (leagueId: string, accountId: string | null): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'request-1',
});

/** What the database itself was told, read inside the command's transaction. */
const fences = (scope: LeagueScope) =>
  sql<{ league: string; account: string; role: string }>`
    select current_setting('app.league_id', true) as league,
           current_setting('app.account_id', true) as account,
           current_user as role`
    .execute(transactionOf(scope))
    .then(({ rows }) => rows[0]);

describe('commandTransaction', () => {
  it("sets the context's league and account, as the app's restricted role", async () => {
    const seen = await runner(context(a.leagueId, a.ownerId), async ({ scope }) => ({
      scope: { leagueId: scope.leagueId, accountId: scope.accountId },
      database: await fences(scope),
    }));
    expect(seen).toEqual({
      scope: { leagueId: a.leagueId, accountId: a.ownerId },
      database: { league: a.leagueId, account: a.ownerId, role: 'app_user' },
    });
    const visitor = await runner(context(a.leagueId, null), async ({ scope }) => fences(scope));
    expect(visitor).toMatchObject({ league: a.leagueId, account: '' });
  });

  it("sees only the context's league", async () => {
    const seen = await runner(context(b.leagueId, a.ownerId), async ({ scope }) => ({
      current: (await findCurrentLeague(scope))?.id,
      other: await transactionOf(scope)
        .selectFrom('leagues')
        .select('id')
        .where('id', '=', a.leagueId)
        .execute(),
    }));
    expect(seen).toEqual({ current: b.leagueId, other: [] });
  });

  it('refuses a context whose league is not an id', async () => {
    await expect(runner(context('not-an-id', null), async () => null)).rejects.toThrow(
      'leagueId is not a UUID',
    );
  });

  it('rolls back what a command wrote before it returned an expected error', async () => {
    const renameThenRefuse = defineCommand({
      name: 'leagues.rename_then_refuse',
      permission: 'league.settings',
      input: z.object({}),
      allowed: async () => true,
      run: async ({ tx }: { tx: LeaguesTx }): Promise<Result<null, { code: 'too-late' }>> => {
        expect(await tx.leagues.setName('Written, then undone', 1)).toBe(2);
        return fail({ code: 'too-late' });
      },
    });
    const transaction = commandTransaction(db, (scope) => ({
      jobs: noJobs,
      leagues: leaguesStore(scope),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    }));
    const deps = { transaction, events: [], log: () => {}, now: () => 0 };
    expect(await renameThenRefuse(context(a.leagueId, a.ownerId), {}, deps)).toEqual({
      ok: false,
      error: { code: 'too-late' },
    });
    const row = await one(pglite, 'select name, version from leagues where id = $1', [a.leagueId]);
    expect(row).toEqual({ name: 'Made-up League', version: 1 });
  });
});
