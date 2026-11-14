// Who may use the bin (A-5, T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import {
  hasPermission,
  leagueScope,
  readOnlyLeagueStatuses,
  type Permission,
  type Scope,
} from '../access/index.ts';
import type { BinTx } from './bin.ts';

/**
 * Seeing the whole bin: `bin.restore` league-wide (the owner and admins), in any state
 * of the league. An admin limited to one program does not see the league's whole bin.
 */
export function maySeeBin(context: CommandContext, tx: BinTx): Promise<boolean> {
  return hasPermission(context, tx, 'bin.restore', leagueScope);
}

/**
 * Restoring (A-5): whoever may remove a kind of thing may restore it, so each restore
 * names the permission its remove needs (`teams.manage` for a team, `people.manage`
 * for a person, `schedule.publish` for a game a publish removed), at the scope of the
 * thing. The owner and admins hold all of them, so they restore anything. Not while the
 * league is archived or suspended (U-9). A thing that is not there is checked league-wide.
 */
export async function mayRestore(
  context: CommandContext,
  tx: BinTx,
  permission: Permission,
  scope: Scope,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, permission, scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/** The scope of a season's things: its program, or league-wide if it is not there. */
export async function binSeasonScope(tx: BinTx, seasonId: string): Promise<Scope> {
  const programId = await tx.bin.seasonProgramId(seasonId);
  return programId === undefined ? leagueScope : { type: 'program', id: programId };
}
