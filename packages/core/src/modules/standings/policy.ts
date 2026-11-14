// Who may act on a season's standings: `standings.adjust` at the season's program
// (P4 §4), and not while the league is archived or suspended (U-9).
import type { CommandContext } from '../../command/index.ts';
import { hasPermission, leagueScope, readOnlyLeagueStatuses } from '../access/index.ts';
import type { StandingsTx } from './ports.ts';

export async function mayAdjustStandings(
  context: CommandContext,
  tx: StandingsTx,
  seasonId: string,
): Promise<boolean> {
  // A season that is not here is checked league-wide, so only those who may act on
  // every program's standings learn it is missing.
  const season = await tx.games.findSeason(seasonId);
  const scope =
    season === undefined ? leagueScope : { type: 'program' as const, id: season.programId };
  if (!(await hasPermission(context, tx, 'standings.adjust', scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}
