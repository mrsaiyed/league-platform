// The access module's store (core's AccessStore), bound to one league scope. The
// owner and the grants are read from the database on every call (T-75).
import type { AccessStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findCurrentLeague,
  findInvitation,
  findInvitationByTokenHash,
  findProgramId,
  findRoleGrant,
  hasPendingInvitation,
  insertInvitation,
  insertRoleGrant,
  listActiveGrantsOf,
  listOpenInvitations,
  listRoleGrants,
  markInvitationAccepted,
  markInvitationCancelled,
  renewInvitationLink,
  replaceInvitationLink,
  revokeRoleGrant,
} from '../queries/index.ts';

export function accessStore(scope: LeagueScope): AccessStore {
  return {
    ownerAccountId: async () => (await findCurrentLeague(scope))?.ownerAccountId,
    leagueStatus: async () => (await findCurrentLeague(scope))?.status,
    activeGrantsOf: (accountId) => listActiveGrantsOf(scope, accountId),
    programExists: async (programId) => (await findProgramId(scope, programId)) !== undefined,
    hasPendingInvitation: (email, role, where) => hasPendingInvitation(scope, email, role, where),
    createInvitation: (invitation) => insertInvitation(scope, invitation),
    findInvitation: (invitationId) => findInvitation(scope, invitationId),
    findInvitationByTokenHash: (tokenHash) => findInvitationByTokenHash(scope, tokenHash),
    renewInvitation: (invitationId, tokenHash, days) =>
      renewInvitationLink(scope, invitationId, tokenHash, days),
    replaceInvitationLink: (invitationId, tokenHash) =>
      replaceInvitationLink(scope, invitationId, tokenHash),
    cancelInvitation: (invitationId) => markInvitationCancelled(scope, invitationId),
    acceptInvitation: (invitationId, tokenHash, accountId) =>
      markInvitationAccepted(scope, invitationId, tokenHash, accountId),
    createGrant: (grant) => insertRoleGrant(scope, grant),
    findGrant: (grantId) => findRoleGrant(scope, grantId),
    revokeGrant: (grantId, by) => revokeRoleGrant(scope, grantId, by),
    listGrants: () => listRoleGrants(scope),
    listOpenInvitations: () => listOpenInvitations(scope),
  };
}
