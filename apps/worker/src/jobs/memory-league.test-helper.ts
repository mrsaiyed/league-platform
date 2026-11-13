// One league's storage on plain objects, for the worker's job tests: the stores the
// access module's commands and the invitation email job use, in transactions that
// work on a copy and keep it only if the work returns (as a commit does), with jobs
// recorded only on commit (T-130). The same commands and step run against the real
// database in packages/database (access-commands.test.ts). Expiry, which the
// database works out from its own clock, is stood in for by an `expired` flag.
import type {
  AccessTx,
  ActivityEntry,
  CommandContext,
  CommandDeps,
  Grant,
  Invitation,
  Job,
  LeagueRecord,
  Scope,
  TransactionRunner,
} from '@srleagues/core';
import type { InvitationEmailTx } from './invitation-email-job.ts';

type StoredInvitation = Omit<Invitation, 'status'> & {
  tokenHash: string;
  acceptedBy: string | null;
  cancelled: boolean;
  expired: boolean;
};

export type MemoryLeague = {
  /** Undefined stands for a league in the bin. */
  league: LeagueRecord | undefined;
  programs: string[];
  grants: Grant[];
  invitations: StoredInvitation[];
  activity: ActivityEntry[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const strangerId = '01900000-0000-7000-8000-0000000000a3';

let ids = 0;
const nextId = () => `01900000-0000-7000-8000-${(++ids).toString(16).padStart(12, '0')}`;

const sameScope = (a: Scope, b: Scope) =>
  a.type === b.type && (a.type === 'league' || (b.type !== 'league' && a.id === b.id));

const statusOf = (i: StoredInvitation): Invitation['status'] =>
  i.acceptedBy !== null
    ? 'accepted'
    : i.cancelled
      ? 'cancelled'
      : i.expired
        ? 'expired'
        : 'pending';

const view = (i: StoredInvitation): Invitation => ({
  id: i.id,
  email: i.email,
  role: i.role,
  scope: i.scope,
  status: statusOf(i),
  invitedByAccountId: i.invitedByAccountId,
  expiresAt: i.expiresAt,
});

export function memoryLeague() {
  const db = {
    state: {
      league: {
        id: leagueId,
        name: 'North "Made-up" League',
        slug: 'north-league',
        status: 'live',
        ownerAccountId: ownerId,
        version: 1,
      },
      programs: [],
      grants: [],
      invitations: [],
      activity: [],
    } as MemoryLeague,
    jobs: [] as Job[],
    opened: [] as CommandContext[],
    /** Transactions running now: 0 once every one has committed or rolled back. */
    open: 0,
  };

  const transaction: TransactionRunner<InvitationEmailTx> = async (context, work) => {
    db.opened.push(context);
    db.open++;
    try {
      const s = structuredClone(db.state);
      const staged: Job[] = [];
      const result = await work({
        jobs: { enqueue: async (job) => void staged.push(job) },
        leagues: { currentLeague: async () => s.league },
        activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
        access: {
          ownerAccountId: async () => s.league?.ownerAccountId,
          leagueStatus: async () => s.league?.status,
          activeGrantsOf: async (account) =>
            s.grants.filter((g) => g.accountId === account && g.revokedAt === null),
          programExists: async (id) => s.programs.includes(id),
          hasPendingInvitation: async (email, role, scope) =>
            s.invitations.some(
              (i) =>
                statusOf(i) === 'pending' &&
                i.email === email &&
                i.role === role &&
                sameScope(i.scope, scope),
            ),
          createInvitation: async (n) => {
            const stored: StoredInvitation = {
              id: nextId(),
              email: n.email,
              role: n.role,
              scope: n.scope,
              invitedByAccountId: n.invitedByAccountId,
              expiresAt: `in ${n.lifetimeDays} days`,
              tokenHash: n.tokenHash,
              acceptedBy: null,
              cancelled: false,
              expired: false,
            };
            s.invitations.push(stored);
            return view(stored);
          },
          findInvitation: async (id) => {
            const found = s.invitations.find((i) => i.id === id);
            return found === undefined ? undefined : view(found);
          },
          findInvitationByTokenHash: async (hash) => {
            const found = s.invitations.find((i) => i.tokenHash === hash);
            return found === undefined ? undefined : view(found);
          },
          renewInvitation: async (id, tokenHash, days) => {
            const found = s.invitations.find((i) => i.id === id);
            if (found === undefined || found.acceptedBy !== null || found.cancelled) {
              return undefined;
            }
            Object.assign(found, { tokenHash, expired: false, expiresAt: `in ${days} days` });
            return view(found);
          },
          replaceInvitationLink: async (id, tokenHash) => {
            const found = s.invitations.find((i) => i.id === id);
            if (found === undefined || statusOf(found) !== 'pending') return undefined;
            found.tokenHash = tokenHash;
            return view(found);
          },
          cancelInvitation: async (id) => {
            const found = s.invitations.find((i) => i.id === id);
            if (found === undefined || found.acceptedBy !== null || found.cancelled) return false;
            found.cancelled = true;
            return true;
          },
          acceptInvitation: async (id, tokenHash, account) => {
            const found = s.invitations.find((i) => i.id === id);
            if (found === undefined || statusOf(found) !== 'pending') return false;
            if (found.tokenHash !== tokenHash) return false;
            found.acceptedBy = account;
            return true;
          },
          createGrant: async (n) => {
            const held = s.grants.some(
              (g) =>
                g.accountId === n.accountId &&
                g.role === n.role &&
                g.revokedAt === null &&
                sameScope(g.scope, n.scope),
            );
            if (held) return 'already-held';
            const grant: Grant = { id: nextId(), ...n, revokedAt: null };
            s.grants.push(grant);
            return grant;
          },
          findGrant: async (id) => s.grants.find((g) => g.id === id),
          revokeGrant: async (id) => {
            const found = s.grants.find((g) => g.id === id);
            if (found === undefined || found.revokedAt !== null) return false;
            s.grants = s.grants.map((g) => (g === found ? { ...g, revokedAt: 'now' } : g));
            return true;
          },
          listGrants: async () => s.grants.filter((g) => g.revokedAt === null),
          listOpenInvitations: async () =>
            s.invitations.filter((i) => i.acceptedBy === null && !i.cancelled).map(view),
        },
      });
      // Commit: the copy and the jobs are kept only now.
      db.state = s;
      db.jobs.push(...staged);
      return result;
    } finally {
      db.open--;
    }
  };

  const deps: CommandDeps<AccessTx> = {
    transaction,
    events: [],
    log: () => {},
    now: () => 0,
  };
  const as = (accountId: string | null): CommandContext => ({
    leagueId,
    accountId,
    requestId: 'r-1',
  });
  return { db, transaction, deps, as };
}
