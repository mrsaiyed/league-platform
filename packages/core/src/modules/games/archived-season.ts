// The games module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377, T-381). Nothing in an archived season's games changes except through an admin's
// correction with a reason (games.reopen_game, games.put_sheet_back, S-7, T-380), which
// name no check here; a tracked game's reopen is refused there for a scorekeeper only, by
// its own rule (reopen-window.ts). Two checks, each named by the commands they guard; the
// command framework refuses with `season-archived`:
// - gameInArchivedSeason: always refused there (a scorekeeper's own reopen, S-36; mark
//   not started, S-40; scorekeepers, postponing, cancelling, the game's rules).
// - gameInArchivedSeasonNotReopened: entering a result, and the tracker's work, refused
//   unless a correction is open on the game: reopened by a correction with a reason and
//   not decided again since (T-381). Once its result is entered again the game is final,
//   and read-only again; a game corrected before the season was archived is no exception.
import { isDecided } from './game-fields.ts';
import type { GameRecord, GamesStore } from './ports.ts';

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

/**
 * Whether a correction is open on the game: its newest correction reopened it (left it
 * undecided) and it is not decided again since. A put back leaves it decided: not open.
 */
export async function correctionOpenOn(
  game: Pick<GameRecord, 'id' | 'status'>,
  tx: ArchiveReader,
): Promise<boolean> {
  if (isDecided(game.status)) return false;
  const [newest] = await tx.games.correctionsNewestFirst(game.id);
  return newest !== undefined && !isDecided(newest.after.status);
}

export async function gameInArchivedSeasonNotReopened(
  input: { readonly gameId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  const game = await tx.games.find(input.gameId);
  if (game === undefined || !(await tx.games.seasonArchived(game.seasonId))) return false;
  return !(await correctionOpenOn(game, tx));
}
