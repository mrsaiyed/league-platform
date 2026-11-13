// Who may run the games commands (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import {
  accessOfAccount,
  allows,
  hasPermission,
  hasPermissionAnywhere,
  leagueScope,
  readOnlyLeagueStatuses,
  type Permission,
  type Scope,
} from '../access/index.ts';
import type { GamesTx } from './ports.ts';
import { mayScoreUnder, scoresWithoutAssignment, scoringRuleOf } from './scoring-access.ts';

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

/**
 * Scoring a game (P4 §4): `games.score` at the game's program, not while the league
 * is archived or suspended (U-9), and, for a scorekeeper in a league that scores
 * assigned games only, an assignment to this game. Roles, the setting and the
 * assignment are all read fresh in this transaction (T-75). A game that is not
 * there is checked league-wide, as for any change to a game; with no game there is
 * no assignment, so a scorekeeper limited to assigned games learns nothing of it.
 */
export async function mayScoreGame(
  context: CommandContext,
  tx: GamesTx,
  gameId: string,
): Promise<boolean> {
  if (context.accountId === null) return false;
  const scope = await gameScope(tx, gameId);
  const holder = await accessOfAccount(tx, context.accountId);
  if (holder === undefined || !allows(holder, 'games.score', scope)) return false;
  const status = await tx.access.leagueStatus();
  if (status === undefined || readOnlyLeagueStatuses.includes(status)) return false;
  if (scoresWithoutAssignment(holder, scope)) return true;
  const rule = await scoringRuleOf(tx);
  const assigned = rule === 'assignedOnly' && (await tx.games.isAssigned(gameId, holder.accountId));
  return mayScoreUnder(holder, scope, rule, assigned);
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
