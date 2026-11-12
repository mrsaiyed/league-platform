// T3 §5 and §11: role grants, invitations, the logs and command receipts.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newAccount,
  newLeague,
  newProgram,
  one,
  refused,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const grant = (
  leagueId: string,
  accountId: string,
  role: string,
  scopeType = 'league',
  scopeId: string | null = null,
) =>
  one<{ id: string }>(
    db,
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [leagueId, accountId, role, scopeType, scopeId],
  );

let tokens = 0;
const tokenHash = () => (++tokens).toString(16).padStart(64, '0');

const invite = (
  leagueId: string,
  options: { scopeType?: string; scopeId?: string | null; hash?: string; role?: string } = {},
) =>
  one<{ id: string }>(
    db,
    `insert into invitations (league_id, email, role, scope_type, scope_id, token_hash, expires_at)
     values ($1, 'invitee@example.test', $2, $3, $4, $5, now() + interval '7 days') returning id`,
    [
      leagueId,
      options.role ?? 'scheduler',
      options.scopeType ?? 'league',
      options.scopeId ?? null,
      options.hash ?? tokenHash(),
    ],
  );

describe('role_grants', () => {
  it('grant a role for the whole league or for one of its programs', async () => {
    const { leagueId } = await newLeague(db);
    const account = await newAccount(db);
    const volleyball = await newProgram(db, leagueId);
    await grant(leagueId, account, 'admin');
    await grant(leagueId, account, 'scheduler', 'program', volleyball);
  });

  it("cannot be scoped to another league's program (T-40)", async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    await expect(
      grant(a.leagueId, await newAccount(db), 'scheduler', 'program', b.defaultProgramId),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'role_grants_scope_program' });
  });

  it('name a scope exactly when the scope is not the whole league', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const account = await newAccount(db);
    await expect(
      grant(leagueId, account, 'admin', 'league', defaultProgramId),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'role_grants_scope_id' });
    await expect(grant(leagueId, account, 'admin', 'program', null)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'role_grants_scope_id',
    });
  });

  it('know only the fixed roles (A-3), each at the scopes it fits', async () => {
    const { leagueId } = await newLeague(db);
    const account = await newAccount(db);
    // The owner is leagues.owner_account_id, not a grant.
    for (const role of ['owner', 'superuser']) {
      await expect(grant(leagueId, account, role)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'role_grants_role',
      });
    }
    await expect(grant(leagueId, account, 'coach')).rejects.toMatchObject({
      ...refused.check,
      constraint: 'role_grants_role_fits_scope',
    });
  });

  it('refuse club and team scopes until those tables exist', async () => {
    const { leagueId } = await newLeague(db);
    const somewhere = '00000000-0000-7000-8000-000000000000';
    await expect(
      grant(leagueId, await newAccount(db), 'club_admin', 'club', somewhere),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'role_grants_scope_available' });
    await expect(
      grant(leagueId, await newAccount(db), 'coach', 'team', somewhere),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'role_grants_scope_available' });
  });

  it('hold one active grant of a role at a scope; a revoked one can be granted again', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const account = await newAccount(db);
    const first = await grant(leagueId, account, 'editor');
    await expect(grant(leagueId, account, 'editor')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'role_grants_one_active',
    });
    await grant(leagueId, account, 'editor', 'program', defaultProgramId);
    await expect(
      grant(leagueId, account, 'editor', 'program', defaultProgramId),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'role_grants_one_active' });

    await db.query('update role_grants set revoked_at = now() where id = $1', [first.id]);
    await grant(leagueId, account, 'editor');
  });

  it('never change whose grant it is, the role or the scope; only revoked_at moves', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const { id } = await grant(leagueId, await newAccount(db), 'editor');
    const other = await newAccount(db);
    for (const [sql, params] of [
      ['update role_grants set account_id = $2 where id = $1', [id, other]],
      ["update role_grants set role = 'admin' where id = $1", [id]],
      [
        "update role_grants set scope_type = 'program', scope_id = $2 where id = $1",
        [id, defaultProgramId],
      ],
    ] as const) {
      await expect(db.query(sql, [...params])).rejects.toMatchObject(refused.restrict);
    }
    await db.query(
      'update role_grants set revoked_at = now(), revoked_by_account_id = $2 where id = $1',
      [id, other],
    );
  });
});

describe('invitations', () => {
  it('store a unique token hash, 64 hex characters', async () => {
    const { leagueId } = await newLeague(db);
    const hash = tokenHash();
    await invite(leagueId, { hash });
    await expect(invite(leagueId, { hash })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'invitations_token_hash_key',
    });
    await expect(invite(leagueId, { hash: 'not-a-hash' })).rejects.toMatchObject({
      ...refused.check,
      constraint: 'invitations_token_hash_format',
    });
  });

  it("cannot be scoped to another league's program (T-40)", async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    await invite(a.leagueId, { scopeType: 'program', scopeId: a.defaultProgramId });
    await expect(
      invite(a.leagueId, { scopeType: 'program', scopeId: b.defaultProgramId }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'invitations_scope_program' });
  });

  it('are accepted by an account, or cancelled, not both', async () => {
    const { leagueId } = await newLeague(db);
    const { id } = await invite(leagueId);
    await expect(
      db.query('update invitations set accepted_at = now() where id = $1', [id]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'invitations_accepted_by_whom' });
    await db.query(
      'update invitations set accepted_at = now(), accepted_by_account_id = $2 where id = $1',
      [id, await newAccount(db)],
    );
    await expect(
      db.query('update invitations set cancelled_at = now() where id = $1', [id]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'invitations_accepted_or_cancelled' });
  });

  it('never change who is invited, to which role or scope', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const { id } = await invite(leagueId);
    for (const [sql, params] of [
      ["update invitations set email = 'someone-else@example.test' where id = $1", [id]],
      ["update invitations set role = 'admin' where id = $1", [id]],
      [
        "update invitations set scope_type = 'program', scope_id = $2 where id = $1",
        [id, defaultProgramId],
      ],
    ] as const) {
      await expect(db.query(sql, [...params])).rejects.toMatchObject(refused.restrict);
    }
    await db.query('update invitations set cancelled_at = now() where id = $1', [id]);
  });
});

describe('history is only ever added to (T-45)', () => {
  it('activity_log refuses changes and removals', async () => {
    const { leagueId, ownerId } = await newLeague(db);
    const { id } = await one<{ id: string }>(
      db,
      `insert into activity_log (league_id, actor_account_id, action, summary)
       values ($1, $2, 'league.renamed', 'Renamed the league') returning id`,
      [leagueId, ownerId],
    );
    await expect(
      db.query("update activity_log set summary = 'Something else' where id = $1", [id]),
    ).rejects.toMatchObject(refused.restrict);
    await expect(db.query('delete from activity_log where id = $1', [id])).rejects.toMatchObject(
      refused.restrict,
    );
  });

  it('command_receipts records a command once per league and account, and never changes', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const commandId = '01900000-0000-7000-8000-000000000001';
    const receipt = (leagueId: string, accountId: string | null) =>
      one<{ id: string }>(
        db,
        `insert into command_receipts (league_id, account_id, command_id, command, result)
         values ($1, $2, $3, 'leagues.rename', '{"ok": true}') returning id`,
        [leagueId, accountId, commandId],
      );
    const first = await receipt(a.leagueId, a.ownerId);
    const once = { ...refused.unique, constraint: 'command_receipts_once' };
    await expect(receipt(a.leagueId, a.ownerId)).rejects.toMatchObject(once);
    await receipt(b.leagueId, a.ownerId);
    // Another account using the same command id gets its own receipt.
    const stranger = await newAccount(db);
    await receipt(a.leagueId, stranger);
    // Commands the system ran (no account) share one key space.
    await receipt(a.leagueId, null);
    await expect(receipt(a.leagueId, null)).rejects.toMatchObject(once);

    // The lookup names the account, so it finds only that account's own result.
    const { rows } = await db.query<{ id: string }>(
      `select id from command_receipts
       where league_id = $1 and account_id is not distinct from $2 and command_id = $3`,
      [a.leagueId, a.ownerId, commandId],
    );
    expect(rows.map((r) => r.id)).toEqual([first.id]);

    const id = first.id;
    await expect(
      db.query(`update command_receipts set result = '{"ok": false}' where id = $1`, [id]),
    ).rejects.toMatchObject(refused.restrict);
    await expect(
      db.query('delete from command_receipts where id = $1', [id]),
    ).rejects.toMatchObject(refused.restrict);
  });

  describe('a support visit (T-77)', () => {
    const visit = (leagueId: string, staff: string, length: string, startedAt = 'now()') =>
      one<{ id: string; started_at: Date; now: Date }>(
        db,
        `insert into support_access_log (league_id, staff_account_id, reason, started_at, ended_at)
         values ($1, $2, 'Owner asked for help with the schedule', ${startedAt},
                 now() + interval '${length}')
         returning id, started_at, now() as now`,
        [leagueId, staff],
      );
    const endAt = (id: string, when: string) =>
      db.query(`update support_access_log set ended_at = ${when} where id = $1`, [id]);

    it('lasts at most an hour, counted from when its row is written', async () => {
      const { leagueId } = await newLeague(db);
      const staff = await newAccount(db);
      await expect(visit(leagueId, staff, '61 minutes')).rejects.toMatchObject({
        ...refused.check,
        constraint: 'support_access_log_at_most_an_hour',
      });
      // A start dated a day back is moved to now, so the visit cannot be stretched.
      const early = await visit(leagueId, staff, '30 minutes', "now() - interval '1 day'");
      expect(early.started_at).toEqual(early.now);
      // Nor can a visit be written already over.
      await expect(visit(leagueId, staff, '-1 minute')).rejects.toMatchObject({
        ...refused.check,
        constraint: 'support_access_log_at_most_an_hour',
      });
    });

    it('can be ended early while it runs, never extended or ended in the past', async () => {
      const { leagueId } = await newLeague(db);
      const { id } = await visit(leagueId, await newAccount(db), '1 hour');
      await endAt(id, "now() + interval '10 minutes'");
      await expect(endAt(id, "now() + interval '20 minutes'")).rejects.toMatchObject(
        refused.restrict,
      );
      await expect(endAt(id, "now() - interval '1 minute'")).rejects.toMatchObject(
        refused.restrict,
      );
      await expect(
        db.query("update support_access_log set reason = 'Something else' where id = $1", [id]),
      ).rejects.toMatchObject(refused.restrict);
      await expect(
        db.query('delete from support_access_log where id = $1', [id]),
      ).rejects.toMatchObject(refused.restrict);
    });

    it('never changes once it is over', async () => {
      const { leagueId } = await newLeague(db);
      const { id } = await visit(leagueId, await newAccount(db), '1 hour');
      await endAt(id, 'now()');
      // A later statement: the visit ended before it began.
      await expect(endAt(id, 'now()')).rejects.toMatchObject(refused.restrict);
      await expect(
        db.query('update support_access_log set ended_at = ended_at where id = $1', [id]),
      ).rejects.toMatchObject(refused.restrict);
    });
  });
});

describe('purging a league from the bin removes its history (T-51, T-220)', () => {
  const history = async (leagueId: string) => {
    const staff = await newAccount(db);
    await db.query(
      `insert into activity_log (league_id, action, summary) values ($1, 'league.renamed', 'Renamed')`,
      [leagueId],
    );
    await db.query(
      `insert into support_access_log (league_id, staff_account_id, reason, ended_at)
       values ($1, $2, 'Owner asked for help', now() + interval '1 hour')`,
      [leagueId, staff],
    );
    await db.query(
      `insert into command_receipts (league_id, command_id, command, result)
       values ($1, public.uuid_v7(), 'leagues.rename', '{"ok": true}')`,
      [leagueId],
    );
  };
  const countHistory = async (leagueId: string) =>
    (
      await one<{ n: number }>(
        db,
        `select ((select count(*) from activity_log where league_id = $1)
               + (select count(*) from support_access_log where league_id = $1)
               + (select count(*) from command_receipts where league_id = $1))::int as n`,
        [leagueId],
      )
    ).n;
  const bin = (leagueId: string, ago: string) =>
    db.query(`update leagues set deleted_at = now() - interval '${ago}' where id = $1`, [leagueId]);
  const purge = (leagueId: string) =>
    db.query('select public.purge_league_history($1)', [leagueId]);

  it("removes only that league's history, once it has been in the bin 30 days", async () => {
    const binned = await newLeague(db);
    const kept = await newLeague(db);
    await history(binned.leagueId);
    await history(kept.leagueId);

    await expect(purge(binned.leagueId)).rejects.toMatchObject(refused.restrict);
    await bin(binned.leagueId, '29 days');
    await expect(purge(binned.leagueId)).rejects.toMatchObject(refused.restrict);
    await bin(binned.leagueId, '31 days');
    await purge(binned.leagueId);

    expect(await countHistory(binned.leagueId)).toBe(0);
    expect(await countHistory(kept.leagueId)).toBe(3);
  });

  it('leaves no permission behind, and gives none to a role that does not own the tables', async () => {
    const binned = await newLeague(db);
    await history(binned.leagueId);
    await bin(binned.leagueId, '31 days');
    const removeLog = () =>
      db.query('delete from activity_log where league_id = $1', [binned.leagueId]);

    // After a purge in the same transaction, the setting is cleared again.
    await expect(
      db.transaction(async (tx) => {
        await tx.query('select public.purge_league_history($1)', [binned.leagueId]);
        await tx.query(
          `insert into activity_log (league_id, action, summary) values ($1, 'league.renamed', 'Again')`,
          [binned.leagueId],
        );
        await tx.query('delete from activity_log where league_id = $1', [binned.leagueId]);
      }),
    ).rejects.toMatchObject(refused.restrict);

    // A role that is not the owner may set the setting itself, and it changes nothing.
    await db.exec(`
      create role history_tester;
      grant select, delete on public.activity_log to history_tester;
    `);
    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.query('set local role history_tester');
          await tx.query("select set_config('srleagues.history_purge', $1, true)", [
            binned.leagueId,
          ]);
          await tx.query('delete from activity_log where league_id = $1', [binned.leagueId]);
        }),
      ).rejects.toMatchObject(refused.restrict);
      await expect(
        db.transaction(async (tx) => {
          await tx.query('set local role history_tester');
          await tx.query('select public.purge_league_history($1)', [binned.leagueId]);
        }),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.exec(`
        revoke all on public.activity_log from history_tester;
        drop role history_tester;
      `);
    }
    await expect(removeLog()).rejects.toMatchObject(refused.restrict);
    expect(await countHistory(binned.leagueId)).toBe(3);
  });
});
