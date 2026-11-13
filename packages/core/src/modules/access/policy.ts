// Who may do what (T-74, T4 §4). `hasPermission` is the one check every module's
// policy uses. It reads the owner and the account's grants from the database on
// every call, inside the command's own transaction, so access removed a moment ago
// is already gone (T-75).
import type { CommandContext } from '../../command/index.ts';
import type { AccessTx, Grant, PermissionsTx } from './ports.ts';
import { roleHasPermission, type Permission } from './roles.ts';
import { covers, leagueScope, type Scope } from './scopes.ts';

/** May the acting account do `permission` at `scope` (the whole league by default)? */
export async function hasPermission(
  context: CommandContext,
  tx: PermissionsTx,
  permission: Permission,
  scope: Scope = leagueScope,
): Promise<boolean> {
  const holder = await accessOf(context, tx);
  return holder !== undefined && allows(holder, permission, scope);
}

/** What one account holds in the league: owner or not, and its grants in force. */
export type AccessHolder = {
  readonly accountId: string;
  readonly isOwner: boolean;
  readonly grants: readonly Grant[];
};

/** The acting account's access, read fresh (T-75); undefined for a visitor. */
export async function accessOf(
  context: CommandContext,
  tx: PermissionsTx,
): Promise<AccessHolder | undefined> {
  const accountId = context.accountId;
  if (accountId === null) return undefined;
  const isOwner = (await tx.access.ownerAccountId()) === accountId;
  // The owner may do everything (O-7), so their grants are not needed for a check.
  const grants = isOwner ? [] : await tx.access.activeGrantsOf(accountId);
  return { accountId, isOwner, grants };
}

/** Whether what `holder` holds allows `permission` at `scope`. */
export function allows(holder: AccessHolder, permission: Permission, scope: Scope): boolean {
  if (holder.isOwner) return true;
  return holder.grants.some(
    (grant) =>
      grant.accountId === holder.accountId &&
      grant.revokedAt === null &&
      roleHasPermission(grant.role, permission) &&
      covers(grant.scope, scope),
  );
}

/** Anyone signed in: enough to accept an invitation or read one's own access. */
export async function isSignedIn(context: CommandContext): Promise<boolean> {
  return context.accountId !== null;
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
