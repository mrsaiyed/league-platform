// Who may run the people commands (T-74), read from the database on every call (T-75).
// People are the league's own, so they are checked league-wide.
import type { CommandContext } from '../../command/index.ts';
import { hasPermission, readOnlyLeagueStatuses, type Permission } from '../access/index.ts';
import type { PeopleTx } from './ports.ts';

/** Reading: the permission, in any state of the league (an archived league is readable). */
export function mayReadPeople(
  context: CommandContext,
  tx: PeopleTx,
  permission: Permission,
): Promise<boolean> {
  return hasPermission(context, tx, permission);
}

/** Changing: the permission, and not while the league is archived or suspended (U-9). */
export async function mayChangePeople(
  context: CommandContext,
  tx: PeopleTx,
  permission: Permission,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, permission))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/** Whether the acting account may see and set sensitive fields (R-16, T-76). */
export function maySeeSensitive(context: CommandContext, tx: PeopleTx): Promise<boolean> {
  return hasPermission(context, tx, 'people.read_sensitive');
}
