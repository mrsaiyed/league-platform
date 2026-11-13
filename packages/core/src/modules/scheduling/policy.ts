// Who may run the scheduling commands that change venues and courts (T-74), read from
// the database on every call (T-75). Venues belong to the league, so they are checked
// league-wide: a role limited to one program does not manage them.
import type { CommandContext } from '../../command/index.ts';
import { hasPermission, readOnlyLeagueStatuses, type Permission } from '../access/index.ts';
import type { SchedulingTx } from './ports.ts';

/** Reading: the permission, in any state of the league. */
export async function mayReadSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  permission: Permission,
): Promise<boolean> {
  return hasPermission(context, tx, permission);
}

/** Changing: the permission, and not while the league is archived or suspended (U-9). */
export async function mayChangeSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  permission: Permission,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, permission))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}
