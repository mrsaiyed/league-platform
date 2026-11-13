// The access module's commands against the real database, as the app's restricted
// role: each call is one transaction (commandTransaction). Covers the queries and
// stores behind them; their isolation cases are in ../isolation.
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  acceptInvitation,
  cancelInvitation,
  invite,
  issueInvitationLink,
  listAccess,
  listActivity,
  resendInvitation,
  revokeGrant,
  setLeagueName,
  type AccessTx,
  type CommandDeps,
  type Job,
  type LeaguesTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newProgram,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { jobsStore } from './jobs-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { leaguesStore } from './leagues-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
const jobs: Job[] = [];
let deps: CommandDeps<AccessTx>;
let leaguesDeps: CommandDeps<LeaguesTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    // Into the real jobs table too, which takes ids and nothing else (T-131).
    jobs: {
      enqueue: async (job: Job) => {
        jobs.push(job);
        await jobsStore(scope).enqueue(job);
      },
    },
    leagues: leaguesStore(scope),
    divisions: divisionsStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { log: () => {}, now: () => 0 };
  deps = { transaction, events: [], ...rest };
  leaguesDeps = { transaction, events: [], ...rest };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const as = (leagueId: string, accountId: string | null) => ({
  leagueId,
  accountId,
  requestId: 'r-1',
});
/** What the email job does as it sends (T-226): makes the invitation's link. */
async function linkFor(leagueId: string, invitationId: string): Promise<string> {
  const link = await deps.transaction(as(leagueId, null), (tx) =>
    issueInvitationLink(tx, invitationId),
  );
  if (link === undefined) throw new Error('no link: the invitation is not pending');
  return link.token;
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function invited(role = 'admin', scope?: object) {
  const league = await newLeague(pglite);
  const owner = as(league.leagueId, league.ownerId);
  const result = await invite(owner, { email: 'Helper@Example.test', role, scope }, deps);
  if (!result.ok) throw new Error(`not invited: ${result.error.code}`);
  const { invitationId } = result.value;
  return { league, owner, invitationId, token: await linkFor(league.leagueId, invitationId) };
}

describe('invitations on the database', () => {
  it('stores the hash of the link and lets the link bring someone in, once', async () => {
    const { league, invitationId, token } = await invited();
    const row = await one<{ email: string; token_hash: string; days: number }>(
      pglite,
      `select email, token_hash, round(extract(epoch from expires_at - created_at) / 86400)::int as days
       from invitations where id = $1`,
      [invitationId],
    );
    expect(row).toEqual({ email: 'helper@example.test', token_hash: sha256(token), days: 14 });

    const helper = await newAccount(pglite);
    const accepted = await acceptInvitation(as(league.leagueId, helper), { token }, deps);
    expect(accepted).toMatchObject({
      ok: true,
      value: { role: 'admin', scope: { type: 'league' } },
    });
    const grant = await one<{ account_id: string; granted_by_account_id: string }>(
      pglite,
      'select account_id, granted_by_account_id from role_grants where league_id = $1',
      [league.leagueId],
    );
    expect(grant).toEqual({ account_id: helper, granted_by_account_id: league.ownerId });

    // The new admin can now change the league's settings (P4 §4).
    const renamed = await setLeagueName(
      as(league.leagueId, helper),
      { name: 'Renamed by an admin', version: 1 },
      leaguesDeps,
    );
    expect(renamed).toMatchObject({ ok: true });

    const another = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, another), { token }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
  });

  it('records the email job with the id only; each sending makes a new link (T-226)', async () => {
    const league = await newLeague(pglite);
    const owner = as(league.leagueId, league.ownerId);
    const sent = await invite(owner, { email: 'job@example.test', role: 'editor' }, deps);
    if (!sent.ok) throw new Error(`not invited: ${sent.error.code}`);
    const { invitationId } = sent.value;
    const job = await one<{ type: string; ids: unknown }>(
      pglite,
      'select type, ids from jobs where league_id = $1',
      [league.leagueId],
    );
    expect(job).toEqual({ type: 'email.send', ids: { invitationId } });
    const before = await one<{ token_hash: string }>(
      pglite,
      'select token_hash from invitations where id = $1',
      [invitationId],
    );

    // A retried job sends a new link, and the earlier one stops working.
    const first = await linkFor(league.leagueId, invitationId);
    const second = await linkFor(league.leagueId, invitationId);
    const after = await one<{ token_hash: string; days: number }>(
      pglite,
      `select token_hash, round(extract(epoch from expires_at - created_at) / 86400)::int as days
       from invitations where id = $1`,
      [invitationId],
    );
    expect(after).toEqual({ token_hash: sha256(second), days: 14 });
    expect(after.token_hash).not.toBe(before.token_hash);
    const someone = as(league.leagueId, await newAccount(pglite));
    expect(await acceptInvitation(someone, { token: first }, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
    expect(await acceptInvitation(someone, { token: second }, deps)).toMatchObject({ ok: true });

    // Nothing to send once it is used, expired or cancelled.
    expect(
      await deps.transaction(as(league.leagueId, null), (tx) =>
        issueInvitationLink(tx, invitationId),
      ),
    ).toBeUndefined();
    const { id: expiredId } = await one<{ id: string }>(
      pglite,
      `insert into invitations (league_id, email, role, token_hash, invited_by_account_id,
                                created_at, expires_at)
       values ($1, 'gone@example.test', 'editor', $2, $3, now() - interval '20 days',
               now() - interval '1 minute') returning id`,
      [league.leagueId, sha256('expired'), league.ownerId],
    );
    expect(
      await deps.transaction(as(league.leagueId, null), (tx) => issueInvitationLink(tx, expiredId)),
    ).toBeUndefined();
    const toCancel = await invite(owner, { email: 'off@example.test', role: 'editor' }, deps);
    if (!toCancel.ok) throw new Error('not invited');
    const cancelledId = toCancel.value.invitationId;
    expect(await cancelInvitation(owner, { invitationId: cancelledId }, deps)).toMatchObject({
      ok: true,
    });
    const cancelledHash = await one<{ token_hash: string }>(
      pglite,
      'select token_hash from invitations where id = $1',
      [cancelledId],
    );
    expect(
      await deps.transaction(as(league.leagueId, null), (tx) =>
        issueInvitationLink(tx, cancelledId),
      ),
    ).toBeUndefined();
    expect(
      await one<{ token_hash: string }>(
        pglite,
        'select token_hash from invitations where id = $1',
        [cancelledId],
      ),
    ).toEqual(cancelledHash);
  });

  it("finds no invitation from another league's link", async () => {
    const { token } = await invited();
    const other = await newLeague(pglite);
    const someone = await newAccount(pglite);
    expect(await acceptInvitation(as(other.leagueId, someone), { token }, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
  });

  it('expires by the database clock; re-sending gives a fresh link and ends the old one', async () => {
    const league = await newLeague(pglite);
    const token = 'e'.repeat(43);
    const { id } = await one<{ id: string }>(
      pglite,
      `insert into invitations (league_id, email, role, token_hash, invited_by_account_id,
                                created_at, expires_at)
       values ($1, 'late@example.test', 'editor', $2, $3, now() - interval '20 days',
               now() - interval '1 day') returning id`,
      [league.leagueId, sha256(token), league.ownerId],
    );
    const someone = await newAccount(pglite);
    const asSomeone = as(league.leagueId, someone);
    expect(await acceptInvitation(asSomeone, { token }, deps)).toMatchObject({
      error: { code: 'invitation-expired' },
    });
    const owner = as(league.leagueId, league.ownerId);
    expect(await resendInvitation(owner, { invitationId: id }, deps)).toMatchObject({ ok: true });
    expect(await acceptInvitation(asSomeone, { token }, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
    expect(
      await acceptInvitation(asSomeone, { token: await linkFor(league.leagueId, id) }, deps),
    ).toMatchObject({
      ok: true,
      value: { role: 'editor' },
    });
  });

  it('cancels, after which the link does nothing and the list no longer shows it', async () => {
    const { league, owner, invitationId, token } = await invited('scheduler');
    expect(await cancelInvitation(owner, { invitationId }, deps)).toMatchObject({ ok: true });
    const someone = await newAccount(pglite);
    expect(await acceptInvitation(as(league.leagueId, someone), { token }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
    expect(await listAccess(owner, {}, deps)).toMatchObject({
      ok: true,
      value: { ownerAccountId: league.ownerId, grants: [], invitations: [] },
    });
  });

  it('invites to one program, and refuses another league program', async () => {
    const league = await newLeague(pglite);
    const program = await newProgram(pglite, league.leagueId);
    const owner = as(league.leagueId, league.ownerId);
    const input = { email: 'p@example.test', role: 'scheduler' };
    expect(
      await invite(owner, { ...input, scope: { type: 'program', id: program } }, deps),
    ).toMatchObject({ ok: true });
    const other = await newLeague(pglite);
    expect(
      await invite(
        owner,
        { ...input, scope: { type: 'program', id: other.defaultProgramId } },
        deps,
      ),
    ).toMatchObject({ error: { code: 'program-not-found' } });
    expect(
      await invite(owner, { ...input, scope: { type: 'program', id: program } }, deps),
    ).toMatchObject({ error: { code: 'already-invited' } });
  });
});

describe('removing access on the database (T-75)', () => {
  it('works at once: the very next command is refused', async () => {
    const { league, owner, token } = await invited();
    const helper = await newAccount(pglite);
    const accepted = await acceptInvitation(as(league.leagueId, helper), { token }, deps);
    if (!accepted.ok) throw new Error('not accepted');
    expect(await revokeGrant(owner, { grantId: accepted.value.grantId }, deps)).toMatchObject({
      ok: true,
    });
    expect(
      await setLeagueName(
        as(league.leagueId, helper),
        { name: 'Too late', version: 1 },
        leaguesDeps,
      ),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } });
    const row = await one<{ revoked_by_account_id: string; revoked: boolean }>(
      pglite,
      'select revoked_by_account_id, revoked_at is not null as revoked from role_grants where id = $1',
      [accepted.value.grantId],
    );
    expect(row).toEqual({ revoked_by_account_id: league.ownerId, revoked: true });
  });
});

describe('the activity log on the database (A-6)', () => {
  it('records each change with who made it, newest first, a page at a time', async () => {
    const { league, owner, invitationId } = await invited('editor');
    await resendInvitation(owner, { invitationId }, deps);
    await cancelInvitation(owner, { invitationId }, deps);
    const all = await listActivity(owner, {}, deps);
    if (!all.ok) throw new Error('not read');
    expect(all.value.map((e) => e.action)).toEqual([
      'access.cancel_invitation',
      'access.resend_invitation',
      'access.invite',
    ]);
    expect(all.value[0]).toMatchObject({
      actorAccountId: league.ownerId,
      targetType: 'invitation',
      targetId: invitationId,
      summary: 'activity.access.cancel_invitation',
      details: { role: 'editor', scopeType: 'league', scopeId: null },
    });
    const first = all.value[0];
    if (first === undefined) throw new Error('no entry');
    const next = await listActivity(owner, { limit: 1, before: first }, deps);
    expect(next).toMatchObject({ ok: true, value: [{ action: 'access.resend_invitation' }] });
    expect(JSON.stringify(all.value)).not.toContain('helper@example.test');
  });
});
