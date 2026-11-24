// For each final or forfeited game on a list, what it says about putting it right to the
// person looking (reopen-view.ts), from the tracker's own read (games.read_reopen_offer,
// step 2.120), the read of a result recorded by hand (games.read_own_result_offer, step
// 2.177) and the person's access (games.correct at the game's program). The doors
// check everything again when tapped.
import {
  allows,
  readOwnResultOffer,
  readReopenOffer,
  type AccessHolder,
  type CommandContext,
  type CommandDeps,
  type MyGame,
  type TrackerTx,
} from '@srleagues/core';
import { reopenViewOf, type ReopenView } from './reopen-view.ts';

const decided = (status: string) => status === 'final' || status === 'forfeit';

/** Whether the holder may correct games at this program (games.reopen_game's own check). */
export function mayCorrectAt(holder: AccessHolder | undefined, programId: string): boolean {
  return (
    holder !== undefined && allows(holder, 'games.correct', { type: 'program', id: programId })
  );
}

export async function readReopenViews(
  games: readonly Pick<MyGame, 'id' | 'status' | 'programId'>[],
  context: CommandContext,
  holder: AccessHolder | undefined,
  deps: CommandDeps<TrackerTx>,
): Promise<ReadonlyMap<string, ReopenView>> {
  const views = new Map<string, ReopenView>();
  for (const game of games.filter((g) => decided(g.status))) {
    const offer = await readReopenOffer(context, { gameId: game.id }, deps);
    const tracker = offer.ok ? offer.value : undefined;
    const mayCorrect = mayCorrectAt(holder, game.programId);
    // Recorded by hand, for someone who may not correct games: their own door, if it is
    // theirs and the minutes run (step 2.177, S-52).
    const byHand =
      tracker === undefined ||
      (tracker.reopen.when === 'no' && tracker.reopen.code === 'not-ended-by-tracker');
    const own =
      byHand && !mayCorrect
        ? await readOwnResultOffer(context, { gameId: game.id }, deps).then((o) =>
            o.ok ? o.value : undefined,
          )
        : undefined;
    views.set(game.id, reopenViewOf(tracker, mayCorrect, own));
  }
  return views;
}
