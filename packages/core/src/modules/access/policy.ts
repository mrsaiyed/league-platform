// Who may do what (T-74, T4 §4). `hasPermission` is the one check every module's
// policy uses. It reads the owner and the account's grants from the database on
// every call, inside the command's own transaction, so access removed a moment ago
// is already gone (T-75). A league in the bin, or out of sight, has no owner to
// read, and then nobody may do anything in it.
import type { CommandContext } from '../../command/index.ts';
import { readOnlyLeagueStatuses } from './access-values.ts';
import type { AccessTx, Grant, Invitation, PermissionsTx } from './ports.ts';
import { isPermission, roleHasPermission, type Permission } from './roles.ts';
import { covers, leagueScope, type Scope } from './scopes.ts';

/** What one account holds in the league: owner or not, and its grants in force. */
export type AccessHolder = {
  readonly accountId: string;
  readonly isOwner: boolean;
  readonly grants: readonly Grant[];
};

/** May the acting account do `permission` at `scope` (the whole league by default)? */
export async function hasPermission(
  context: CommandContext,
  tx: PermissionsTx,
  permission: Permission,
  scope: Scope = leagueScope,
): Promise<boolean> {
  const holder =
    context.accountId === null ? undefined : await accessOfAccount(tx, context.accountId);
  return holder !== undefined && allows(holder, permission, scope);
}

/**
 * What an account holds in the transaction's league, read fresh (T-75): undefined
 * if the league is in the bin or out of sight.
 */
export async function accessOfAccount(
  tx: PermissionsTx,
  accountId: string,
): Promise<AccessHolder | undefined> {
  const owner = await tx.access.ownerAccountId();
  if (owner === undefined) return undefined;
  const isOwner = owner === accountId;
  // The owner may do everything (O-7), so their grants are not needed for a check.
  const grants = isOwner ? [] : await tx.access.activeGrantsOf(accountId);
  return { accountId, isOwner, grants };
}

/**
 * Whether what `holder` holds allows `permission` at `scope`. Fails closed: a name
 * that is not one of the permissions (a typo that got past the types, a value read
 * from outside) is allowed to no one, the owner included.
 */
export function allows(holder: AccessHolder, permission: Permission, scope: Scope): boolean {
  if (!isPermission(permission)) return false;
  if (holder.isOwner) return true;
  return holder.grants.some(
    (grant) =>
      grant.accountId === holder.accountId &&
      grant.revokedAt === null &&
      roleHasPermission(grant.role, permission) &&
      covers(grant.scope, scope),
  );
}

/** Someone is signed in and the league is there: enough to read one's own access. */
export async function isSignedInHere(context: CommandContext, tx: PermissionsTx): Promise<boolean> {
  return context.accountId !== null && (await tx.access.ownerAccountId()) !== undefined;
}

/** U-9: no one is invited into, or joins, an archived or suspended league. */
export async function isOpenForNewPeople(tx: PermissionsTx): Promise<boolean> {
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/**
 * Whoever sent the invitation may still give its role there, read fresh (T-75). An
 * invitation with no sender may not. Checked when it is accepted, re-sent and
 * emailed, so access removed after sending ends what was offered.
 */
export async function senderStillMay(tx: PermissionsTx, invitation: Invitation): Promise<boolean> {
  if (invitation.invitedByAccountId === null) return false;
  const sender = await accessOfAccount(tx, invitation.invitedByAccountId);
  return sender !== undefined && allows(sender, 'access.manage', invitation.scope);
}

// Changing an invitation or a grant that exists: whoever may manage access where it
// applies. When it is not found (or is another league's), only those who manage
// access for the whole league get through, to be told "not found"; anyone else is
// refused, so they learn nothing.

export async function mayManageInvitation(
  context: CommandContext,
  tx: AccessTx,
  invitationId: string,
): Promise<boolean> {
  const invitation = await tx.access.findInvitation(invitationId);
  return hasPermission(context, tx, 'access.manage', invitation?.scope ?? leagueScope);
}

export async function mayManageGrant(
  context: CommandContext,
  tx: AccessTx,
  grantId: string,
): Promise<boolean> {
  const grant = await tx.access.findGrant(grantId);
  return hasPermission(context, tx, 'access.manage', grant?.scope ?? leagueScope);
}
