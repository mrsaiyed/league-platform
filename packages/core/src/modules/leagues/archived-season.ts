// The leagues module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377): its commands that change a season's own rules, settings, dates or divisions
// name this check, and the command framework refuses them with `season-archived`.
import { archivedSeasonStatus } from './league-values.ts';
import type { LeaguesStore } from './ports.ts';

export async function seasonIsArchived(
  input: { readonly seasonId: string },
  tx: { readonly leagues: Pick<LeaguesStore, 'findSeason'> },
): Promise<boolean> {
  return (await tx.leagues.findSeason(input.seasonId))?.status === archivedSeasonStatus;
}
