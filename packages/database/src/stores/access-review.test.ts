// The rules added after the step 1.12 review, on the real database as the app's
// role: removing a sender takes their invitations with them, accepting checks the
// offer again, a re-sent or used link cannot be used, a repeated grant is a clean
// answer, and binned and read-only leagues.
//
// Races: PGlite has one connection, so two transactions never truly overlap here.
// What can be shown is that each guard holds when the other side has already
// happened: the update that accepts names the link it was found by, and the grant
// insert gives way to one already there. On PostgreSQL the row lock taken by those
// updates makes the second of two concurrent requests wait and then fail the same
// conditions; not verified until a test runs against a real server.
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  acceptInvitation,
  cancelInvitation,
  invite,
  resendInvitation,
  revokeGrant,
  type AccessTx,
  type CommandDeps,
  type Job,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  findInvitation,
  insertRoleGrant,
  listActiveGrantsOf,
  markInvitationAccepted,
  renewInvitationLink,
} from '../queries/index.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newProgram,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { leaguesStore } from './leagues-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
const jobs: Job[] = [];
let deps: CommandDeps<AccessTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (job: Job) => void jobs.push(job) },
      leagues: leaguesStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const as = (leagueId: string, accountId: string) => ({ leagueId, accountId, requestId: 'r' });
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const lastToken = () => jobs.at(-1)?.ids['token'] ?? '';

/** A league, an admin in it, and an invitation the admin sent. */
async function adminInvited(scope?: object) {
  const league = await newLeague(pglite);
  const adminId = await newAccount(pglite);
  const { id: adminGrantId } = await one<{ id: string }>(
    pglite,
    `insert into role_grants (league_id, account_id, role) values ($1, $2, 'admin') returning id`,
    [league.leagueId, adminId],
  );
  const sent = await invite(
    as(league.leagueId, adminId),
    { email: 'new@example.test', role: 'editor', scope },
    deps,
  );
  if (!sent.ok) throw new Error(`not invited: ${sent.error.code}`);
  return {
    league,
    adminId,
    adminGrantId,
    invitationId: sent.value.invitationId,
    token: lastToken(),
  };
}

describe('removing the sender', () => {
  it('cancels the invitations they sent, so the link no longer works', async () => {
    const { league, adminGrantId, invitationId, token } = await adminInvited();
    const removed = await revokeGrant(
      as(league.leagueId, league.ownerId),
      { grantId: adminGrantId },
      deps,
    );
    expect(removed).toMatchObject({ ok: true, value: { cancelledInvitations: 1 } });
    const row = await one<{ cancelled: boolean }>(
      pglite,
      'select cancelled_at is not null as cancelled from invitations where id = $1',
      [invitationId],
    );
    expect(row.cancelled).toBe(true);
    const joiner = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, joiner), { token }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
  });

  it('withdraws the offer even if their access ended some other way', async () => {
    const { league, adminGrantId, token } = await adminInvited();
    await pglite.query('update role_grants set revoked_at = now() where id = $1', [adminGrantId]);
    const joiner = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, joiner), { token }, deps)).toEqual({
      ok: false,
      error: { code: 'invitation-withdrawn' },
    });
    const grants = await one<{ n: number }>(
      pglite,
      'select count(*)::int as n from role_grants where account_id = $1',
      [joiner],
    );
    expect(grants.n).toBe(0);
  });
});

describe('accepting checks the offer again', () => {
  it('refuses when the program has gone to the bin', async () => {
    const league = await newLeague(pglite);
    const program = await newProgram(pglite, league.leagueId);
    const owner = as(league.leagueId, league.ownerId);
    await invite(
      owner,
      { email: 'p@example.test', role: 'scheduler', scope: { type: 'program', id: program } },
      deps,
    );
    const token = lastToken();
    await pglite.query('update programs set deleted_at = now() where id = $1', [program]);
    const joiner = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, joiner), { token }, deps)).toMatchObject({
      error: { code: 'program-not-found' },
    });
  });
});

describe('links and grants under a race', () => {
  it('a link re-sent after it was read cannot be used to accept', async () => {
    const { league, invitationId, token } = await adminInvited();
    const joiner = await newAccount(pglite);
    const taken = await withTransaction(
      db,
      { leagueId: league.leagueId, accountId: joiner },
      async (scope) => {
        // The accept found the invitation by its link; the re-send lands before it writes.
        const found = await findInvitation(scope, invitationId);
        await renewInvitationLink(scope, invitationId, sha256('a new link'), 14);
        return {
          found,
          accepted: await markInvitationAccepted(scope, invitationId, sha256(token), joiner),
        };
      },
    );
    expect(taken.found).toMatchObject({ status: 'pending' });
    expect(taken.accepted).toBe(false);
  });

  it('one link brings in one person: the second accept is refused', async () => {
    const { league, token } = await adminInvited();
    const first = await newAccount(pglite);
    const second = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, first), { token }, deps)).toMatchObject({
      ok: true,
    });
    expect(await acceptInvitation(as(league.leagueId, second), { token }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
    const { league: other, invitationId } = await adminInvited();
    const twice = await withTransaction(
      db,
      { leagueId: other.leagueId, accountId: first },
      async (scope) => [
        await markInvitationAccepted(scope, invitationId, sha256(lastToken()), first),
        await markInvitationAccepted(scope, invitationId, sha256(lastToken()), second),
      ],
    );
    expect(twice).toEqual([true, false]);
  });

  it('a grant made a moment ago answers "already held", and the transaction goes on', async () => {
    const league = await newLeague(pglite);
    const account = await newAccount(pglite);
    const grant = { accountId: account, role: 'editor', scope: { type: 'league' } } as const;
    const result = await withTransaction(
      db,
      { leagueId: league.leagueId, accountId: account },
      async (scope) => {
        const made = await insertRoleGrant(scope, { ...grant, grantedByAccountId: null });
        const again = await insertRoleGrant(scope, { ...grant, grantedByAccountId: null });
        return { made, again, held: await listActiveGrantsOf(scope, account) };
      },
    );
    expect(result.again).toBe('already-held');
    expect(result.held).toHaveLength(1);
    expect(result.made).toMatchObject({ id: result.held[0]?.id });
  });
});

describe('a league in the bin', () => {
  it('refuses everyone, the owner included', async () => {
    const { league, adminId, adminGrantId, invitationId, token } = await adminInvited();
    await pglite.query('update leagues set deleted_at = now() where id = $1', [league.leagueId]);
    const refused = { ok: false, error: { code: 'not-allowed' } };
    for (const accountId of [league.ownerId, adminId]) {
      const actor = as(league.leagueId, accountId);
      expect(await invite(actor, { email: 'x@example.test', role: 'editor' }, deps)).toEqual(
        refused,
      );
      expect(await resendInvitation(actor, { invitationId }, deps)).toEqual(refused);
      expect(await cancelInvitation(actor, { invitationId }, deps)).toEqual(refused);
      expect(await revokeGrant(actor, { grantId: adminGrantId }, deps)).toEqual(refused);
    }
    const joiner = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, joiner), { token }, deps)).toEqual(refused);
  });
});

describe('archived and suspended leagues (U-9)', () => {
  it('take no new people; invitations can still be cancelled and access removed', async () => {
    for (const status of ['archived', 'suspended']) {
      const { league, adminGrantId, invitationId, token } = await adminInvited();
      const second = await invite(
        as(league.leagueId, league.ownerId),
        { email: 'second@example.test', role: 'editor' },
        deps,
      );
      if (!second.ok) throw new Error('not invited');
      await pglite.query('update leagues set status = $1 where id = $2', [status, league.leagueId]);
      const owner = as(league.leagueId, league.ownerId);
      const readOnly = { ok: false, error: { code: 'league-read-only' } };
      expect(await invite(owner, { email: 'x@example.test', role: 'editor' }, deps)).toEqual(
        readOnly,
      );
      expect(await resendInvitation(owner, { invitationId }, deps)).toEqual(readOnly);
      const joiner = await newAccount(pglite);
      expect(await acceptInvitation(as(league.leagueId, joiner), { token }, deps)).toEqual(
        readOnly,
      );
      expect(
        await cancelInvitation(owner, { invitationId: second.value.invitationId }, deps),
      ).toMatchObject({ ok: true });
      expect(await revokeGrant(owner, { grantId: adminGrantId }, deps)).toMatchObject({
        ok: true,
      });
    }
  });
});
