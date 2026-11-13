// The jobs table (0006, record 012): ids only (T-131), recorded once per dedupe key,
// and taken by the worker alone through take_jobs, one lease at a time (T-137).
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { jobErrorCodes, jobTypes } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newLeague,
  one,
  refused,
  type AppContext,
  type MadeLeague,
} from './schema.test-helper.ts';

let db: PGlite;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  db = await freshSchema();
  a = await newLeague(db);
  b = await newLeague(db);
});
afterAll(async () => {
  await db.close();
});

type Taken = {
  job_id: string;
  job_league_id: string;
  job_type: string;
  job_ids: Record<string, string>;
  job_attempt: number;
  job_max_attempts: number;
  job_lease_token: string;
};

/** Records a job as the app does, in the job's league. */
const record = (
  leagueId: string,
  ids: unknown,
  extra: { dedupeKey?: string; type?: string } = {},
) =>
  asApp(db, { league: leagueId }, (tx) =>
    tx.query<{ id: string }>(
      `insert into jobs (league_id, type, ids, dedupe_key) values ($1, $2, $3, $4)
       on conflict (league_id, type, dedupe_key) where dedupe_key is not null do nothing
       returning id`,
      [leagueId, extra.type ?? 'email.send', JSON.stringify(ids), extra.dedupeKey ?? null],
    ),
  );

/** Takes due jobs as the worker does: app_user, no league or account set. */
const take = (howMany = 50, leaseSeconds = 60, context: AppContext = {}) =>
  asApp(db, context, (tx) =>
    tx.query<Taken>('select * from public.take_jobs($1, $2)', [howMany, leaseSeconds]),
  ).then((r) => r.rows);

/** Empties the queue between tests, as the owner. */
const clear = () =>
  db.query(
    "update jobs set state = 'done', lease_token = null, lease_expires_at = null, finished_at = now() where state in ('waiting', 'running')",
  );

const check = (constraint: string) => ({ ...refused.check, constraint });

describe('a job carries ids only (T-131)', () => {
  it('accepts up to ten UUIDs, and real dates under date-named keys', async () => {
    const ids = Object.fromEntries(
      Array.from({ length: 8 }, (_, k) => [`thing${k}Id`, randomUUID()]),
    );
    await expect(
      record(a.leagueId, { ...ids, gameDay: '2026-11-14', startsOn: '2028-02-29' }),
    ).resolves.toBeDefined();
    await expect(record(a.leagueId, {})).resolves.toBeDefined();
    await clear();
  });

  it('refuses names, emails, phones, numbers, nesting, wrong dates and too many ids', async () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: 11 }, (_, k) => [`thing${k}Id`, randomUUID()]),
    );
    for (const ids of [
      { email: 'someone@example.test' },
      { name: 'Made Up' },
      { phone: '555-123-4567' },
      { invitationId: randomUUID().toUpperCase() },
      { invitationId: '2026-11-14' },
      { gameDay: randomUUID() },
      { gameDay: '2026-02-30' },
      { gameDay: '2026-11-14 ' },
      { count: 3 },
      { nested: { id: randomUUID() } },
      { Bad_Key: randomUUID() },
      [randomUUID()],
      'text',
      null,
      tooMany,
    ]) {
      await expect(record(a.leagueId, ids)).rejects.toMatchObject(check('jobs_ids_only'));
    }
  });

  it('refuses a type not on the list of job types, and every job type core has is on it', async () => {
    for (const type of ['john.smith', 'Send Email', 'notes.tell_owner']) {
      await expect(record(a.leagueId, {}, { type })).rejects.toMatchObject(
        check('jobs_type_known'),
      );
    }
    for (const type of jobTypes) await record(a.leagueId, {}, { type });
    await clear();
    const { list } = await one<{ list: string }>(
      db,
      "select pg_get_constraintdef(oid) as list from pg_constraint where conname = 'jobs_type_known'",
    );
    expect([...list.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...jobTypes].sort(),
    );
  });

  it('refuses a dedupe key that is not ids joined by colons', async () => {
    for (const dedupeKey of [
      'someone@example.test',
      'john.smith',
      'Made-Up',
      '555-123-4567',
      `invitation:${randomUUID()}`,
      `${randomUUID()}:`,
      '2026-02-30',
      '',
      Array(11).fill(randomUUID()).join(':'),
    ]) {
      await expect(record(a.leagueId, {}, { dedupeKey })).rejects.toMatchObject(
        check('jobs_dedupe_key_ids_only'),
      );
    }
  });
});

describe('a dedupe key', () => {
  it('records the same job once per league and type, and leaves others alone', async () => {
    const key = `${randomUUID()}:2026-11-14`;
    expect((await record(a.leagueId, {}, { dedupeKey: key })).rows).toHaveLength(1);
    expect((await record(a.leagueId, {}, { dedupeKey: key })).rows).toHaveLength(0);
    expect((await record(b.leagueId, {}, { dedupeKey: key })).rows).toHaveLength(1);
    expect(
      (await record(a.leagueId, {}, { dedupeKey: key, type: 'email.status' })).rows,
    ).toHaveLength(1);
    await clear();
  });
});

describe('what the app may write', () => {
  it('records only what a job is, never its progress', async () => {
    const progress: [string, string][] = [
      ['state', "'done'"],
      ['attempts', '1'],
      ['max_attempts', '1'],
      ['last_error', "'unexpected'"],
      ['lease_token', 'gen_random_uuid()'],
    ];
    for (const [column, value] of progress) {
      await expect(
        asApp(db, { league: a.leagueId }, (tx) =>
          tx.query(
            `insert into jobs (league_id, type, ${column}) values ($1, 'email.send', ${value})`,
            [a.leagueId],
          ),
        ),
      ).rejects.toMatchObject(refused.privilege);
    }
  });

  it('keeps a known code as the last error, never other text', async () => {
    const id = (await record(a.leagueId, {})).rows[0]!.id;
    for (const text of ['Could not reach someone@example.test', 'john.smith', 'TypeError']) {
      await expect(
        asApp(db, { league: a.leagueId }, (tx) =>
          tx.query('update jobs set last_error = $1 where id = $2', [text, id]),
        ),
      ).rejects.toMatchObject(check('jobs_last_error_known'));
    }
    for (const code of jobErrorCodes) {
      await db.query('update jobs set last_error = $1 where id = $2', [code, id]);
    }
    const { list } = await one<{ list: string }>(
      db,
      "select pg_get_constraintdef(oid) as list from pg_constraint where conname = 'jobs_last_error_known'",
    );
    expect([...list.matchAll(/'([a-z_-]+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...jobErrorCodes].sort(),
    );
    await clear();
  });
});

describe('take_jobs', () => {
  it('leases due jobs of every league to the worker, ids only, each once', async () => {
    const ofA = (await record(a.leagueId, { inviteId: randomUUID() })).rows[0]!.id;
    const ofB = (await record(b.leagueId, { inviteId: randomUUID() })).rows[0]!.id;
    const taken = await take();
    expect(taken.map((t) => t.job_id).sort()).toEqual([ofA, ofB].sort());
    expect(taken[0]).toEqual({
      job_id: expect.any(String),
      job_league_id: expect.any(String),
      job_type: 'email.send',
      job_ids: { inviteId: expect.any(String) },
      job_attempt: 1,
      job_max_attempts: 5,
      job_lease_token: expect.any(String),
    });
    // Leased: nobody else takes them while the lease runs.
    expect(await take()).toEqual([]);
    await clear();
  });

  it("is refused to a transaction with a league or an account set: every request's and command's", async () => {
    const id = (await record(a.leagueId, {})).rows[0]!.id;
    for (const context of [
      { league: a.leagueId },
      { account: a.ownerId },
      { league: b.leagueId, account: b.ownerId },
    ]) {
      await expect(take(50, 60, context)).rejects.toMatchObject({
        ...refused.privilege,
        message: expect.stringContaining('for the worker'),
      });
    }
    expect(
      (await one<{ state: string }>(db, 'select state from jobs where id = $1', [id])).state,
    ).toBe('waiting');
    await clear();
  });

  it('takes no job that is not yet due, and at most how_many', async () => {
    await asApp(db, { league: a.leagueId }, (tx) =>
      tx.query(
        `insert into jobs (league_id, type, run_after) values ($1, 'recaps.plan', now() + interval '1 hour')`,
        [a.leagueId],
      ),
    );
    for (let k = 0; k < 3; k++) await record(a.leagueId, {});
    expect(await take(2)).toHaveLength(2);
    expect(await take()).toHaveLength(1);
    expect(await take()).toEqual([]);
    await clear();
  });

  it('takes a job again when its lease ran out, counting the attempt, and fails it after the last', async () => {
    const id = (await record(a.leagueId, {})).rows[0]!.id;
    const expire = () =>
      db.query("update jobs set lease_expires_at = now() - interval '1 second' where id = $1", [
        id,
      ]);
    const first = await take();
    expect(first.map((t) => [t.job_id, t.job_attempt])).toEqual([[id, 1]]);
    await expire();
    const second = await take();
    expect(second.map((t) => [t.job_id, t.job_attempt])).toEqual([[id, 2]]);
    expect(second[0]!.job_lease_token).not.toBe(first[0]!.job_lease_token);
    for (let attempt = 3; attempt <= 5; attempt++) {
      await expire();
      expect((await take()).map((t) => t.job_attempt)).toEqual([attempt]);
    }
    await expire();
    expect(await take()).toEqual([]);
    expect(
      await one(db, 'select state, last_error, attempts from jobs where id = $1', [id]),
    ).toEqual({ state: 'failed', last_error: 'lease_expired', attempts: 5 });
  });

  it('refuses a batch over 50 or a lease over an hour', async () => {
    for (const [howMany, lease] of [
      [0, 60],
      [51, 60],
      [10, 5],
      [10, 3601],
    ] as const) {
      await expect(take(howMany, lease)).rejects.toMatchObject({ code: '22023' });
    }
  });
});

describe('settling a job, in its league', () => {
  it('changes only its progress, and only in its own league', async () => {
    const id = (await record(a.leagueId, {})).rows[0]!.id;
    for (const change of [
      "type = 'email.status'",
      `ids = '{}'`,
      `dedupe_key = '${randomUUID()}'`,
      'max_attempts = 9',
      'attempts = 0',
    ]) {
      await expect(
        asApp(db, { league: a.leagueId }, (tx) =>
          tx.query(`update jobs set ${change} where id = $1`, [id]),
        ),
      ).rejects.toMatchObject(refused.privilege);
    }
    const fromB = await asApp(db, { league: b.leagueId }, (tx) =>
      tx.query("update jobs set state = 'failed', finished_at = now() where id = $1", [id]),
    );
    expect(fromB.affectedRows).toBe(0);
    await clear();
  });

  it('keeps a lease exactly while running, and a finish time once settled', async () => {
    const id = (await record(a.leagueId, {})).rows[0]!.id;
    await expect(
      db.query("update jobs set state = 'running' where id = $1", [id]),
    ).rejects.toMatchObject(check('jobs_lease_while_running'));
    await expect(
      db.query("update jobs set state = 'done' where id = $1", [id]),
    ).rejects.toMatchObject(check('jobs_finished_when_settled'));
    await clear();
  });
});
