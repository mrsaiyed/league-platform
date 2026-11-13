// The access module's storage on plain objects, for core's command tests. The same
// commands run against the real database in packages/database (stores, the
// two-league harness and the role matrix). Expiry, which the database works out
// from its own clock, is stood in for by each invitation's `expired` flag.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import { issueInvitationLink } from './invitation-link.ts';
import type { AccessTx, ActivityEntry, Grant, Invitation } from './ports.ts';
import { sameScope, type Scope } from './scopes.ts';

type StoredInvitation = Omit<Invitation, 'status'> & {
  tokenHash: string;
  acceptedBy: string | null;
  cancelled: boolean;
  expired: boolean;
};

export type MemoryAccess = {
  /** Undefined stands for a league in the bin or out of sight. */
  ownerId: string | undefined;
  status: string;
  programs: string[];
  grants: Grant[];
  invitations: StoredInvitation[];
  activity: ActivityEntry[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const adminId = '01900000-0000-7000-8000-0000000000a2';
export const strangerId = '01900000-0000-7000-8000-0000000000a3';
export const programId = '01900000-0000-7000-8000-0000000000c1';
export const otherProgramId = '01900000-0000-7000-8000-0000000000c2';

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

let ids = 0;
const nextId = () => `01900000-0000-7000-8000-${(++ids).toString(16).padStart(12, '0')}`;

/** A grant in force, for setting up a test. */
export function grantOf(accountId: string, role: Grant['role'], scope: Scope = { type: 'league' }) {
  return { id: nextId(), accountId, role, scope, grantedByAccountId: ownerId, revokedAt: null };
}

export function memoryAccess(state: Partial<MemoryAccess> = {}) {
  const db = memoryDatabase<MemoryAccess>({
    ownerId,
    status: 'live',
    programs: [programId, otherProgramId],
    grants: [grantOf(adminId, 'admin')],
    invitations: [],
    activity: [],
    ...state,
  });
  const transaction = memoryTransaction(
    db,
    (s, jobs): AccessTx => ({
      jobs,
      activity: {
        record: async (entry) => void s.activity.push(entry),
        list: async (limit, _before, scope) =>
          s.activity
            .map((entry, n) => ({ ...entry, id: `entry-${n}`, at: `2026-11-13T00:00:0${n}Z` }))
            .filter(
              (entry) =>
                scope.type === 'league' ||
                (entry.details['scopeType'] === scope.type &&
                  entry.details['scopeId'] === scope.id),
            )
            .reverse()
            .slice(0, limit),
      },
      access: {
        ownerAccountId: async () => s.ownerId,
        leagueStatus: async () => (s.ownerId === undefined ? undefined : s.status),
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
          if (found === undefined || found.acceptedBy !== null || found.cancelled) return undefined;
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
    }),
  );
  const deps = testDeps(transaction);
  const as = (account: string | null) => ({ leagueId, accountId: account, requestId: 'r-1' });
  /** What the worker does as it sends the invitation's email: makes its link. */
  const linkFor = async (invitationId: string) => {
    const link = await transaction(as(null), (tx) => issueInvitationLink(tx, invitationId));
    if (link === undefined) throw new Error('no link: the invitation is not pending');
    return link.token;
  };
  return { db, deps, as, linkFor };
}
