// T-130: a job is recorded in the same transaction as the change that causes it,
// through a command's tx.jobs, so a command that rolls back leaves no job behind.
import type { PGlite } from '@electric-sql/pglite';
import { defineCommand, fail, ok, type LeaguesTx, type Result } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newLeague,
  newSeason,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { jobsStore, leaguesStore } from '../stores/index.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let league: MadeLeague;
let seasonId: string;
beforeAll(async () => {
  pglite = await freshSchema();
  league = await newLeague(pglite);
  seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** Renames the league and records a job about it; refuses afterwards if asked. */
const renameAndTell = defineCommand({
  name: 'leagues.rename_and_tell',
  input: z.object({ name: z.string(), version: z.number(), refuse: z.boolean() }),
  allowed: async () => true,
  run: async ({
    context,
    input,
    tx,
  }: {
    context: { leagueId: string };
    input: { name: string; version: number; refuse: boolean };
    tx: LeaguesTx;
  }): Promise<Result<null, { code: 'refused' }>> => {
    await tx.leagues.setName(input.name, input.version);
    await tx.jobs.enqueue({
      type: 'notify.event',
      leagueId: context.leagueId,
      ids: { seasonId },
      delaySeconds: 600,
      dedupeKey: seasonId,
    });
    return input.refuse ? fail({ code: 'refused' }) : ok(null);
  },
});

const run = (input: { name: string; version: number; refuse: boolean }) =>
  renameAndTell({ leagueId: league.leagueId, accountId: league.ownerId, requestId: 'r' }, input, {
    transaction: commandTransaction(db, (scope) => ({
      jobs: jobsStore(scope),
      leagues: leaguesStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => 0,
  });

type JobRow = { type: string; ids: unknown; state: string; delayed: boolean };
const jobs = async () =>
  (
    await pglite.query<JobRow>(
      `select type, ids, state, run_after > now() + interval '9 minutes' as delayed
       from jobs where league_id = $1`,
      [league.leagueId],
    )
  ).rows;
const name = async () =>
  (
    await pglite.query<{ name: string }>('select name from leagues where id = $1', [
      league.leagueId,
    ])
  ).rows[0]?.name;

describe('insertJob, through a command (T-130)', () => {
  it('leaves no job when the command rolls back', async () => {
    expect(await run({ name: 'Refused Name', version: 1, refuse: true })).toMatchObject({
      ok: false,
    });
    expect(await jobs()).toEqual([]);
    expect(await name()).toBe('Made-up League');
  });

  it('saves the job with the change, ids only, delayed as asked', async () => {
    expect(await run({ name: 'Kept Name', version: 1, refuse: false })).toEqual({
      ok: true,
      value: null,
    });
    expect(await name()).toBe('Kept Name');
    expect(await jobs()).toEqual([
      { type: 'notify.event', ids: { seasonId }, state: 'waiting', delayed: true },
    ]);
  });

  it('records a job with the same dedupe key once', async () => {
    expect(await run({ name: 'Third Name', version: 2, refuse: false })).toMatchObject({
      ok: true,
    });
    expect(await name()).toBe('Third Name');
    expect(await jobs()).toHaveLength(1);
  });
});
