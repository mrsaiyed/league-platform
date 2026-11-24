// The leagues module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377): its commands that change a season's own rules, settings, dates or divisions
// name this check, and the command framework refuses them with `season-archived`.
import { archivedSeasonStatus } from './league-values.ts';
import type { BinStore } from './bin.ts';
import type { DivisionsStore, LeaguesStore } from './ports.ts';
import type { PlaceInput } from './settings/place.ts';

export async function seasonIsArchived(
  input: { readonly seasonId: string },
  tx: { readonly leagues: Pick<LeaguesStore, 'findSeason'> },
): Promise<boolean> {
  return (await tx.leagues.findSeason(input.seasonId))?.status === archivedSeasonStatus;
}

/** A division's season is archived (its edits, removal, order and restore, O-12). */
export async function divisionInArchivedSeason(
  input: { readonly divisionId: string },
  tx: {
    readonly leagues: Pick<LeaguesStore, 'findSeason'>;
    readonly divisions: Pick<DivisionsStore, 'find'>;
  },
): Promise<boolean> {
  const division = await tx.divisions.find(input.divisionId);
  return division !== undefined && seasonIsArchived({ seasonId: division.seasonId }, tx);
}

/** A setting written at an archived season. The league's and a program's stay open. */
export async function settingAtArchivedSeason(
  input: PlaceInput,
  tx: { readonly leagues: Pick<LeaguesStore, 'findSeason'> },
): Promise<boolean> {
  return input.level === 'season' && seasonIsArchived({ seasonId: input.seasonId }, tx);
}

/** A team in the bin whose season is archived: restoring it would change that season. */
export async function binnedTeamInArchivedSeason(
  input: { readonly teamId: string },
  tx: { readonly bin: Pick<BinStore, 'findTeam' | 'seasonArchived'> },
): Promise<boolean> {
  const team = await tx.bin.findTeam(input.teamId);
  return team !== undefined && tx.bin.seasonArchived(team.seasonId);
}

/** A game in the bin whose season is archived: restoring it would change that season. */
export async function binnedGameInArchivedSeason(
  input: { readonly gameId: string },
  tx: { readonly bin: Pick<BinStore, 'findGame' | 'seasonArchived'> },
): Promise<boolean> {
  const game = await tx.bin.findGame(input.gameId);
  return game !== undefined && tx.bin.seasonArchived(game.seasonId);
}
