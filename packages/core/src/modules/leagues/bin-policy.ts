// Who may use the bin (A-5, T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import {
  hasPermission,
  leagueScope,
  readOnlyLeagueStatuses,
  type Scope,
} from '../access/index.ts';
import type { BinTx } from './bin.ts';

/**
 * Seeing the bin: `bin.restore` league-wide, in any state of the league. An admin
 * limited to one program does not see the league's whole bin.
 */
export function maySeeBin(context: CommandContext, tx: BinTx): Promise<boolean> {
  return hasPermission(context, tx, 'bin.restore', leagueScope);
}

/**
 * Restoring: `bin.restore` at the scope of the thing, and not while the league is
 * archived or suspended (U-9). A thing that is not there is checked league-wide.
 */
export async function mayRestore(
  context: CommandContext,
  tx: BinTx,
  scope: Scope,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, 'bin.restore', scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/** The scope of a season's things: its program, or league-wide if it is not there. */
export async function binSeasonScope(tx: BinTx, seasonId: string): Promise<Scope> {
  const programId = await tx.bin.seasonProgramId(seasonId);
  return programId === undefined ? leagueScope : { type: 'program', id: programId };
}
