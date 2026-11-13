// Every role against every command (T4 §12): the ones allowed succeed, all others
// are refused with "not-allowed". Against the real database as the app's role, each
// run in a league of its own, so one run cannot change what the next one sees.
//
// Who may run what is written out here from the spec (P4 §4, O-7, A-6, U-9), not
// read from the permission table in core, so a command that checks the wrong
// permission fails. A command in core's registry with no row here fails too.
//
// Club admins, coaches and captains are not here: their scopes (a club, a team)
// cannot be granted until those tables exist (0004). Their permissions are tested
// in core (modules/access/policy.test.ts), and they join this matrix with the
// clubs and teams step.
import { createHash, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  acceptInvitation,
  cancelInvitation,
  commands,
  createLeague,
  createSeason,
  invite,
  listAccess,
  listActivity,
  myAccess,
  renameShortName,
  resendInvitation,
  revokeGrant,
  setCurrentSeason,
  setLeagueName,
  setLeagueStatus,
  type AccessTx,
  type CommandContext,
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
  newSeason,
  one,
  unique,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { leaguesStore } from './leagues-store.ts';

const actors = [
  'owner',
  'admin',
  'program_admin',
  'registrar',
  'scheduler',
  'editor',
  'scorekeeper',
  'no_role',
  'revoked_admin',
  'staff',
  'visitor',
] as const;
type Actor = (typeof actors)[number];
const signedIn = actors.filter((a) => a !== 'visitor');

type League = MadeLeague & { programId: string; accountOf: (actor: Actor) => string | null };
type Outcome = { readonly ok: boolean; readonly error?: { readonly code: string } };
type Row = {
  readonly command: string;
  readonly name: string;
  readonly allowed: readonly Actor[];
  /** The input, made valid for this league, and the league the call is for. */
  readonly prepare: (league: League) => Promise<{ input: unknown; leagueId?: string }>;
  readonly run: (context: CommandContext, input: unknown) => Promise<Outcome>;
};

let pglite: PGlite;
let db: DatabaseHandle;
let staffId: string;
let accessDeps: CommandDeps<AccessTx>;
let leaguesDeps: CommandDeps<LeaguesTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  staffId = await newAccount(pglite);
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    leagues: leaguesStore(scope, { platformStaff: [staffId] }),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { log: () => {}, now: () => 0 };
  accessDeps = { transaction, events: [], ...rest };
  leaguesDeps = { transaction, events: [], ...rest };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function grant(leagueId: string, role: string, scope: string | null = null) {
  const accountId = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, $3, $4, $5)`,
    [leagueId, accountId, role, scope === null ? 'league' : 'program', scope],
  );
  return accountId;
}

/** A league with one account per actor. */
async function leagueWithActors(): Promise<League> {
  const made = await newLeague(pglite);
  const programId = await newProgram(pglite, made.leagueId);
  const ids = new Map<Actor, string>([
    ['owner', made.ownerId],
    ['admin', await grant(made.leagueId, 'admin')],
    ['program_admin', await grant(made.leagueId, 'admin', programId)],
    ['registrar', await grant(made.leagueId, 'registrar')],
    ['scheduler', await grant(made.leagueId, 'scheduler')],
    ['editor', await grant(made.leagueId, 'editor')],
    ['scorekeeper', await grant(made.leagueId, 'scorekeeper')],
    ['no_role', await newAccount(pglite)],
    ['revoked_admin', await grant(made.leagueId, 'admin')],
    ['staff', staffId],
  ]);
  await pglite.query(
    `update role_grants set revoked_at = now() where league_id = $1 and account_id = $2`,
    [made.leagueId, ids.get('revoked_admin')],
  );
  return { ...made, programId, accountOf: (actor) => ids.get(actor) ?? null };
}

/** An open invitation sent by the owner, to the whole league or one program. */
async function invitationIn(
  league: League,
  { token = randomUUID(), program = false }: { token?: string; program?: boolean } = {},
) {
  const row = await one<{ id: string }>(
    pglite,
    `insert into invitations (league_id, email, role, scope_type, scope_id, token_hash,
                              invited_by_account_id, expires_at)
     values ($1, $2, 'scorekeeper', $3, $4, $5, $6, now() + interval '7 days') returning id`,
    [
      league.leagueId,
      `${unique('invitee')}@example.test`,
      program ? 'program' : 'league',
      program ? league.programId : null,
      sha256(token),
      league.ownerId,
    ],
  );
  return row.id;
}

/** A grant to a new account, by its id. */
async function grantId(leagueId: string, role: string, scope: string | null = null) {
  const accountId = await grant(leagueId, role, scope);
  const row = await one<{ id: string }>(
    pglite,
    'select id from role_grants where account_id = $1',
    [accountId],
  );
  return row.id;
}

const programAdmins: readonly Actor[] = ['owner', 'admin', 'program_admin'];

const ownerAndAdmins: readonly Actor[] = ['owner', 'admin'];

const rows: readonly Row[] = [
  // League settings (P4 §6): the owner and admins (O-7).
  {
    command: 'leagues.set_name',
    name: "set the league's name",
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: { name: 'Renamed', version: 1 } }),
    run: (c, i) => setLeagueName(c, i, leaguesDeps),
  },
  {
    command: 'leagues.rename_short_name',
    name: "change the league's short name",
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: { slug: unique('renamed'), version: 1 } }),
    run: (c, i) => renameShortName(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_status',
    name: 'publish the league',
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: { status: 'live', version: 1 } }),
    run: (c, i) => setLeagueStatus(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_status',
    name: 'suspend the league (our staff only, U-9)',
    allowed: ['staff'],
    prepare: async () => ({ input: { status: 'suspended', version: 1 } }),
    run: (c, i) => setLeagueStatus(c, i, leaguesDeps),
  },
  {
    command: 'leagues.create_season',
    name: 'add a season',
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: { slug: 'fall', name: 'Fall' } }),
    run: (c, i) => createSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_current_season',
    name: 'make a season current',
    allowed: ownerAndAdmins,
    prepare: async (league) => ({
      input: { seasonId: await newSeason(pglite, league.leagueId, league.defaultProgramId) },
    }),
    run: (c, i) => setCurrentSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.create',
    name: 'create a league (our staff only)',
    allowed: ['staff'],
    prepare: async (league) => ({
      leagueId: randomUUID(),
      input: {
        slug: unique('new-league'),
        name: 'New league',
        timeZone: 'UTC',
        audience: 'adult',
        ownerAccountId: league.ownerId,
        sportKey: 'basketball',
      },
    }),
    run: (c, i) => createLeague(c, i, leaguesDeps),
  },
  // Who has access (P4 §4, §6): the owner and admins; a program's admin for it.
  {
    command: 'access.invite',
    name: 'invite someone to the whole league',
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: { email: 'new@example.test', role: 'editor' } }),
    run: (c, i) => invite(c, i, accessDeps),
  },
  {
    command: 'access.invite',
    name: 'invite someone to one program',
    allowed: ['owner', 'admin', 'program_admin'],
    prepare: async (league) => ({
      input: {
        email: 'new@example.test',
        role: 'scheduler',
        scope: { type: 'program', id: league.programId },
      },
    }),
    run: (c, i) => invite(c, i, accessDeps),
  },
  {
    command: 'access.resend_invitation',
    name: 're-send an invitation',
    allowed: ownerAndAdmins,
    prepare: async (league) => ({ input: { invitationId: await invitationIn(league) } }),
    run: (c, i) => resendInvitation(c, i, accessDeps),
  },
  {
    command: 'access.resend_invitation',
    name: 're-send an invitation to one program',
    allowed: programAdmins,
    prepare: async (league) => ({
      input: { invitationId: await invitationIn(league, { program: true }) },
    }),
    run: (c, i) => resendInvitation(c, i, accessDeps),
  },
  {
    command: 'access.cancel_invitation',
    name: 'cancel an invitation',
    allowed: ownerAndAdmins,
    prepare: async (league) => ({ input: { invitationId: await invitationIn(league) } }),
    run: (c, i) => cancelInvitation(c, i, accessDeps),
  },
  {
    command: 'access.cancel_invitation',
    name: 'cancel an invitation to one program',
    allowed: programAdmins,
    prepare: async (league) => ({
      input: { invitationId: await invitationIn(league, { program: true }) },
    }),
    run: (c, i) => cancelInvitation(c, i, accessDeps),
  },
  {
    command: 'access.revoke_grant',
    name: "remove someone's access",
    allowed: ownerAndAdmins,
    prepare: async (league) => ({ input: { grantId: await grantId(league.leagueId, 'editor') } }),
    run: (c, i) => revokeGrant(c, i, accessDeps),
  },
  {
    command: 'access.revoke_grant',
    name: "remove someone's access to one program",
    allowed: programAdmins,
    prepare: async (league) => ({
      input: { grantId: await grantId(league.leagueId, 'editor', league.programId) },
    }),
    run: (c, i) => revokeGrant(c, i, accessDeps),
  },
  {
    command: 'access.list_access',
    name: 'see who has access',
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: {} }),
    run: (c, i) => listAccess(c, i, accessDeps),
  },
  {
    command: 'access.list_access',
    name: 'see who has access to one program',
    allowed: programAdmins,
    prepare: async (league) => ({ input: { scope: { type: 'program', id: league.programId } } }),
    run: (c, i) => listAccess(c, i, accessDeps),
  },
  // A-6: the activity log is the owner's and admins'.
  {
    command: 'access.list_activity',
    name: 'read the activity log',
    allowed: ownerAndAdmins,
    prepare: async () => ({ input: {} }),
    run: (c, i) => listActivity(c, i, accessDeps),
  },
  {
    command: 'access.list_activity',
    name: "read one program's activity",
    allowed: programAdmins,
    prepare: async (league) => ({ input: { scope: { type: 'program', id: league.programId } } }),
    run: (c, i) => listActivity(c, i, accessDeps),
  },
  // Anyone signed in who holds the link (P4 §4: sign in, and they are in).
  {
    command: 'access.accept_invitation',
    name: 'accept an invitation with its link',
    allowed: signedIn,
    prepare: async (league) => {
      const token = 'a'.repeat(22) + randomUUID().replace(/-/g, '').slice(0, 21);
      await invitationIn(league, { token });
      return { input: { token } };
    },
    run: (c, i) => acceptInvitation(c, i, accessDeps),
  },
  {
    command: 'access.my_access',
    name: "read one's own access",
    allowed: signedIn,
    prepare: async () => ({ input: {} }),
    run: (c, i) => myAccess(c, i, accessDeps),
  },
];

describe('every role against every command (T4 §12)', () => {
  it('has a row for every command in the registry', () => {
    const covered = new Set(rows.map((row) => row.command));
    expect([...commands.keys()].filter((name) => !covered.has(name))).toEqual([]);
    expect([...covered].filter((name) => !commands.has(name))).toEqual([]);
  });

  for (const row of rows) {
    it(`${row.command}: ${row.name}`, async () => {
      const outcomes: Partial<Record<Actor, string>> = {};
      for (const actor of actors) {
        const league = await leagueWithActors();
        const { input, leagueId } = await row.prepare(league);
        const context = {
          leagueId: leagueId ?? league.leagueId,
          accountId: league.accountOf(actor),
          requestId: 'matrix',
        };
        const result = await row.run(context, input);
        outcomes[actor] = result.ok ? 'ok' : (result.error?.code ?? 'failed');
      }
      const expected = Object.fromEntries(
        actors.map((actor) => [actor, row.allowed.includes(actor) ? 'ok' : 'not-allowed']),
      );
      expect(outcomes).toEqual(expected);
    });
  }
});
