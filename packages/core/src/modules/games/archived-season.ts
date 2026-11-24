// The games module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377). Nothing in an archived season's games changes except through an admin's
// correction with a reason (games.reopen_game, S-7), which names no check here. Two
// checks, each named by the commands they guard; the command framework refuses with
// `season-archived`:
// - gameInArchivedSeason: always refused there (a scorekeeper's own reopen, S-36; mark
//   not started, S-40; scorekeepers, postponing, cancelling, the game's rules).
// - gameInArchivedSeasonUncorrected: entering a result, and the tracker's work, refused
//   unless the game has a correction (a reopening with a reason): so a game reopened by
//   that correction can be entered or ended again, and only such a game.
import type { GamesStore } from './ports.ts';

type ArchiveReader = {
  readonly games: Pick<GamesStore, 'find' | 'seasonArchived' | 'correctionsNewestFirst'>;
};

export async function gameInArchivedSeason(
  input: { readonly gameId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  const game = await tx.games.find(input.gameId);
  return game !== undefined && (await tx.games.seasonArchived(game.seasonId));
}

export async function gameInArchivedSeasonUncorrected(
  input: { readonly gameId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  if (!(await gameInArchivedSeason(input, tx))) return false;
  return (await tx.games.correctionsNewestFirst(input.gameId)).length === 0;
}
