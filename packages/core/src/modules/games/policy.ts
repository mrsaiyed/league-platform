// Who may run the games commands (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import {
  hasPermission,
  hasPermissionAnywhere,
  leagueScope,
  readOnlyLeagueStatuses,
  type Permission,
  type Scope,
} from '../access/index.ts';
import type { GamesTx } from './ports.ts';

/**
 * Changing a result: the permission at the game's season's program (so an admin
 * limited to one program works only its games, P4 §4), and not while the league is
 * archived or suspended (U-9). A game that is not there is checked league-wide, so
 * only those who may act on any program's games learn it is missing.
 */
export async function mayChangeGames(
  context: CommandContext,
  tx: GamesTx,
  permission: Permission,
  scope: Scope,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, permission, scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/** Reading the schedule side: the permission held anywhere, in any state of the league. */
export function mayReadGames(
  context: CommandContext,
  tx: GamesTx,
  permission: Permission,
): Promise<boolean> {
  return hasPermissionAnywhere(context, tx, permission);
}

export async function seasonScope(tx: GamesTx, seasonId: string): Promise<Scope> {
  const season = await tx.games.findSeason(seasonId);
  return season === undefined ? leagueScope : { type: 'program', id: season.programId };
}

export async function gameScope(tx: GamesTx, gameId: string): Promise<Scope> {
  const game = await tx.games.find(gameId);
  return game === undefined ? leagueScope : seasonScope(tx, game.seasonId);
}
