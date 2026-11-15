// For each final or forfeited game on a list, what it says about putting it right to the
// person looking (reopen-view.ts), from the tracker's own read (games.read_reopen_offer,
// step 2.120) and the person's access (games.correct at the game's program). The doors
// check everything again when tapped.
import {
  allows,
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
    views.set(
      game.id,
      reopenViewOf(offer.ok ? offer.value : undefined, mayCorrectAt(holder, game.programId)),
    );
  }
  return views;
}
