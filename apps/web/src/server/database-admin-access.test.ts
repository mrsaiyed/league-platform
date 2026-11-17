// The Admins page and the accept page on the database ports (step 2.97): the access
// commands and reads the two pages send, through the web app's own database ports
// (databasePorts: adminAccess), on the seeded made-up database, with the made-up database's
// own invitation mail wired as startup wires it (made-up-invitation-mail.ts). Who may do
// what is written out here from the spec (P4 §4: inviting, re-sending, cancelling and
// removing access are the owner's and the admins'), not read from core.
import {
  acceptInvitation,
  cancelInvitation,
  fail,
  invite,
  leagueScope,
  listAccess,
  listActivity,
  myAccess,
  ok,
  readInvitation,
  resendInvitation,
  revokeGrant,
  type CommandContext,
  type CommandLogLine,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { captureEmail, type SessionIdentity, type SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePorts } from './database-ports.ts';
import { madeUpInvitationMail } from './made-up-invitation-mail.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

const actors = [
  'owner',
  'admin',
  'scheduler',
  'scorekeeper',
  'stranger',
  'otherLeagueAdmin',
  'signedOut',
] as const;
type Actor = (typeof actors)[number];
/** Who may manage access to the whole league (P4 §4, O-7). */
const managers: readonly Actor[] = ['owner', 'admin'];

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
let leagueId: string;
let otherLeagueId: string;
const outbox = captureEmail();
const accountOf = new Map<Actor, string | null>();
const logLines: CommandLogLine[] = [];
const sessions = new Map<string, SessionIdentity>();

async function accountFor(email: string): Promise<string> {
  const token = `token-${randomUUID()}`;
  sessions.set(token, {
    accountId: randomUUID(),
    email,
    emailConfirmed: true,
    sessionId: `session-${token}`,
    hasPassword: true,
    passwordEnteredAt: null,
    lastSignInAt: new Date('2026-11-01T10:00:00Z'),
  });
  const who = await ports.identify(token);
  if (!who.ok) throw new Error(`${email} not signed in: ${who.error.code}`);
  return who.value.accountId;
}
const as = (actor: Actor, league = leagueId): CommandContext => ({
  leagueId: league,
  accountId: accountOf.get(actor) ?? null,
  requestId: randomUUID(),
});
const asAccount = (accountId: string): CommandContext => ({
  leagueId,
  accountId,
  requestId: randomUUID(),
});
const deps = () => ports.adminAccess.deps;
const tokenIn = (text: string) => /\/invitation\/([A-Za-z0-9_-]{43})/.exec(text)?.[1];
const newestTo = (address: string) =>
  outbox
    .messages()
    .filter((m) => m.to === address)
    .at(-1);

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
  db = database.createDatabase(made.source);
  const lakeside = made.leagues.find((l) => l.slug === 'lakeside');
  const maple = made.leagues.find((l) => l.slug === 'maple-street');
  if (lakeside === undefined || maple === undefined) throw new Error('no seed leagues');
  leagueId = lakeside.leagueId;
  otherLeagueId = maple.leagueId;
  ports = databasePorts({
    database,
    db,
    signIn: {
      identify: async ({ accessToken }: { accessToken: string }) => {
        const who = sessions.get(accessToken);
        return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
      },
    } as unknown as SignInService,
    signInMail: {} as SignInMail,
    log: (line) => void logLines.push(line),
    warn: () => {},
    sendQueuedInvitations: madeUpInvitationMail({
      transaction: database.commandTransaction(db, (scope) => ({
        jobs: database.jobsStore(scope),
        leagues: database.leaguesStore(scope),
        access: database.accessStore(scope),
        activity: database.activityLogStore(scope),
      })),
      email: outbox,
      siteOrigin: 'http://localhost:3000',
      sendingAddress: 'league@example.test',
      runDue: database.tableQueue(db).runDue,
    }),
  });
  accountOf.set('owner', lakeside.ownerAccountId);
  accountOf.set('admin', await accountFor('admin@lakeside.example.test'));
  accountOf.set('scheduler', await accountFor('scheduler@lakeside.example.test'));
  accountOf.set('scorekeeper', await accountFor('scorer@lakeside.example.test'));
  accountOf.set('stranger', await accountFor(`stranger-${randomUUID()}@example.test`));
  accountOf.set('otherLeagueAdmin', await accountFor('admin@maple.example.test'));
  accountOf.set('signedOut', null);
}, 180_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

/** An invitation made by the owner and emailed, with the token its email holds. */
async function emailed(role = 'scorekeeper') {
  const email = `helper-${randomUUID()}@example.test`;
  const made = await invite(as('owner'), { email, role, scope: leagueScope }, deps());
  if (!made.ok) throw new Error(`not invited: ${made.error.code}`);
  await ports.adminAccess.sendQueuedInvitations?.();
  const sent = newestTo(email);
  const token = tokenIn(sent?.text ?? '');
  if (token === undefined) throw new Error('no link in the email');
  return { email, invitationId: made.value.invitationId, token, sent };
}

describe('Admins on the database (step 2.97)', () => {
  it('emails an invitation on the made-up database, with a link to the league that works once', async () => {
    const { email, token, sent } = await emailed();
    expect(sent?.subject).toContain('Lakeside');
    expect(sent?.text).toContain(`http://localhost:3000/lakeside/invitation/${token}`);
    const helper = await accountFor(email);
    expect(await readInvitation(asAccount(helper), { token }, deps())).toMatchObject({
      ok: true,
      value: { kind: 'open', role: 'scorekeeper', sentTo: email },
    });
    expect(await acceptInvitation(asAccount(helper), { token }, deps())).toMatchObject({
      ok: true,
    });
    // Opened again: the account that accepted is told so; anyone else, that it does not work.
    expect(await readInvitation(asAccount(helper), { token }, deps())).toMatchObject({
      value: { kind: 'accepted' },
    });
    expect(await readInvitation(as('stranger'), { token }, deps())).toMatchObject({
      error: { code: 'invitation-not-usable' },
    });
    // On the list, as a scorekeeper.
    const listed = await listAccess(as('owner'), {}, deps());
    expect(
      listed.ok &&
        listed.value.grants.some((g) => g.accountId === helper && g.role === 'scorekeeper'),
    ).toBe(true);
  });

  it('names the people on the list from their accounts, and only this league’s', async () => {
    const names = await ports.adminAccess.namesOf(leagueId);
    expect(names.get(accountOf.get('owner') ?? '')).toBe('Ola Lakeside');
    expect(names.get(accountOf.get('scorekeeper') ?? '')).toBe('Sky Scorer');
    // Maple Street's admin holds nothing here: their name is not given through Lakeside.
    expect(names.has(accountOf.get('otherLeagueAdmin') ?? '')).toBe(false);
    const otherNames = await ports.adminAccess.namesOf(otherLeagueId);
    expect(otherNames.has(accountOf.get('scorekeeper') ?? '')).toBe(false);
  });

  it('sends again with a new link, after which the old one does not work', async () => {
    const { email, invitationId, token } = await emailed();
    expect(await resendInvitation(as('admin'), { invitationId }, deps())).toMatchObject({
      ok: true,
    });
    await ports.adminAccess.sendQueuedInvitations?.();
    const second = tokenIn(newestTo(email)?.text ?? '');
    expect(second).toBeDefined();
    expect(second).not.toBe(token);
    expect(await readInvitation(as('stranger'), { token }, deps())).toMatchObject({
      error: { code: 'invitation-not-usable' },
    });
    expect(await readInvitation(as('stranger'), { token: second ?? '' }, deps())).toMatchObject({
      ok: true,
    });
  });

  it('cancels, after which the link does not work and the list no longer shows it', async () => {
    const { invitationId, token } = await emailed();
    expect(await cancelInvitation(as('owner'), { invitationId }, deps())).toMatchObject({
      ok: true,
    });
    expect(await readInvitation(as('stranger'), { token }, deps())).toMatchObject({
      error: { code: 'invitation-not-usable' },
    });
    const listed = await listAccess(as('owner'), {}, deps());
    expect(listed.ok && listed.value.invitations.some((i) => i.id === invitationId)).toBe(false);
  });

  it('refuses the same address to the same role twice, and an owner as a role', async () => {
    const { email } = await emailed('editor');
    expect(
      await invite(as('owner'), { email, role: 'editor', scope: leagueScope }, deps()),
    ).toMatchObject({ error: { code: 'already-invited' } });
    expect(
      await invite(as('admin'), { email, role: 'owner', scope: leagueScope }, deps()),
    ).toMatchObject({ error: { code: 'invalid-input' } });
  });

  it('keeps one grant for someone invited to a role they already hold', async () => {
    const email = 'scorer@lakeside.example.test';
    const made = await invite(
      as('owner'),
      { email, role: 'scorekeeper', scope: leagueScope },
      deps(),
    );
    expect(made.ok).toBe(true);
    await ports.adminAccess.sendQueuedInvitations?.();
    const token = tokenIn(newestTo(email)?.text ?? '') ?? '';
    expect(await acceptInvitation(as('scorekeeper'), { token }, deps())).toMatchObject({
      ok: true,
    });
    const listed = await listAccess(as('owner'), {}, deps());
    const held = listed.ok
      ? listed.value.grants.filter(
          (g) => g.accountId === accountOf.get('scorekeeper') && g.role === 'scorekeeper',
        )
      : [];
    expect(held).toHaveLength(1);
  });

  it('removing access ends it at once: the very next command of that person is refused', async () => {
    const { email, token } = await emailed('scheduler');
    const helper = await accountFor(email);
    const accepted = await acceptInvitation(asAccount(helper), { token }, deps());
    if (!accepted.ok) throw new Error('not accepted');
    const before = await myAccess(asAccount(helper), {}, deps());
    expect(before.ok && before.value.leaguePermissions.includes('schedule.edit')).toBe(true);
    expect(
      await revokeGrant(as('owner'), { grantId: accepted.value.grantId }, deps()),
    ).toMatchObject({ ok: true });
    const after = await myAccess(asAccount(helper), {}, deps());
    expect(after.ok && after.value.leaguePermissions.includes('schedule.edit')).toBe(false);
  });

  it('lets only the owner and admins invite, list, re-send, cancel and remove', async () => {
    const { invitationId } = await emailed();
    for (const actor of actors) {
      const may = managers.includes(actor);
      const listed = await listAccess(as(actor), {}, deps());
      expect([actor, listed.ok]).toEqual([actor, may]);
      const invited = await invite(
        as(actor),
        {
          email: `by-${actor}-${randomUUID()}@example.test`,
          role: 'scorekeeper',
          scope: leagueScope,
        },
        deps(),
      );
      expect([actor, invited.ok]).toEqual([actor, may]);
      if (!may) {
        expect(await resendInvitation(as(actor), { invitationId }, deps())).toMatchObject({
          error: { code: 'not-allowed' },
        });
        expect(await cancelInvitation(as(actor), { invitationId }, deps())).toMatchObject({
          error: { code: 'not-allowed' },
        });
      }
    }
    // Another league's admin, acting in their own league, cannot reach this invitation.
    expect(
      await cancelInvitation(as('otherLeagueAdmin', otherLeagueId), { invitationId }, deps()),
    ).toMatchObject({ error: { code: 'invitation-not-found' } });
    const scorekeeperGrant = await listAccess(as('owner'), {}, deps());
    const grantId = scorekeeperGrant.ok ? (scorekeeperGrant.value.grants[0]?.id ?? '') : '';
    for (const actor of actors.filter((a) => !managers.includes(a))) {
      expect(await revokeGrant(as(actor), { grantId }, deps())).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
  });

  it('writes every change in the activity log, and no link or address in a log line', async () => {
    const log = await listActivity(as('owner'), { limit: 100 }, deps());
    const actions = new Set(log.ok ? log.value.map((e) => e.action) : []);
    for (const action of [
      'access.invite',
      'access.resend_invitation',
      'access.cancel_invitation',
      'access.accept_invitation',
      'access.revoke_grant',
    ]) {
      expect(actions.has(action)).toBe(true);
    }
    const written = JSON.stringify([logLines, log.ok ? log.value : []]);
    for (const email of outbox.messages()) {
      const token = tokenIn(email.text);
      if (token !== undefined) expect(written).not.toContain(token);
      expect(written).not.toContain(email.to);
    }
  });
});
