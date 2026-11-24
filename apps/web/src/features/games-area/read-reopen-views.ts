// For each final or forfeited game on a list, what it says about putting it right to the
// person looking (reopen-view.ts), from the tracker's own read (games.read_reopen_offer,
// step 2.120), the read of results recorded by hand (games.read_own_result_offers, step
// 2.177, one read for the whole list, T-349) and the person's access (games.correct at
// the game's program). The doors check everything again when tapped.
import {
  allows,
  readOwnResultOffers,
  readReopenOffer,
  type AccessHolder,
  type CommandContext,
  type CommandDeps,
  type GameReopenOffer,
  type MyGame,
  type OwnResultWindow,
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
  const facts: { game: (typeof games)[number]; tracker: GameReopenOffer | undefined }[] = [];
  for (const game of games.filter((g) => decided(g.status))) {
    const offer = await readReopenOffer(context, { gameId: game.id }, deps);
    facts.push({ game, tracker: offer.ok ? offer.value : undefined });
  }
  // Recorded by hand, for someone who may not correct games: their own door, if it is
  // theirs and the minutes run (step 2.177, S-52), read for the whole list at once (T-349).
  const ownIds = facts
    .filter(({ game, tracker }) => byHand(tracker) && !mayCorrectAt(holder, game.programId))
    .map(({ game }) => game.id);
  const own = new Map<string, OwnResultWindow>();
  if (ownIds.length > 0) {
    const read = await readOwnResultOffers(context, { gameIds: ownIds }, deps);
    for (const w of read.ok ? read.value : []) own.set(w.gameId, w);
  }
  const views = new Map<string, ReopenView>();
  for (const { game, tracker } of facts) {
    views.set(
      game.id,
      reopenViewOf(tracker, mayCorrectAt(holder, game.programId), own.get(game.id)),
    );
  }
  return views;
}

/** Decided by hand: its tracker did not end it, or there is no tracker's answer. */
const byHand = (tracker: GameReopenOffer | undefined) =>
  tracker === undefined ||
  (tracker.reopen.when === 'no' && tracker.reopen.code === 'not-ended-by-tracker');
