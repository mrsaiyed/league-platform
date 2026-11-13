// Who may run the import commands (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import {
  hasPermission,
  leagueScope,
  readOnlyLeagueStatuses,
  type Permission,
  type Scope,
} from '../access/index.ts';
import type { ImportsTx } from './ports.ts';

/** The scope of a season's program (league-wide if the season is not there). */
export async function seasonScopeOf(tx: ImportsTx, seasonId: string | null): Promise<Scope> {
  const season = seasonId === null ? undefined : await tx.imports.findSeason(seasonId);
  return season === undefined ? leagueScope : { type: 'program', id: season.programId };
}

/**
 * Changing what an import brings in: the permission at the season's program, so a
 * scheduler limited to one program imports only into its seasons; not while the league is
 * archived or suspended (U-9). A season that is not there is checked league-wide.
 */
export async function mayImportInto(
  context: CommandContext,
  tx: ImportsTx,
  permission: Permission,
  seasonId: string | null,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, permission, await seasonScopeOf(tx, seasonId)))) {
    return false;
  }
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}
