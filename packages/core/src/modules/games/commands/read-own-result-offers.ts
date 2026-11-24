// Tells the games list, before any tap, which results recorded by hand the person looking
// may reopen themselves and until when (step 2.177, T-349; P7 §5.5, S-52): the rule of
// games.read_own_result_offer (own-result-window.ts) for many games in one read of the
// database, so the list does not read once more for each decided game. Asked for people
// who may not correct games; it says nothing about the admin's door. Whoever may score
// somewhere in the league may ask; it says only what is theirs: until when, or why not.
// Each game's own door (games.reopen_own_result) checks everything again when tapped.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { ownResultWindows, type OwnResultOffer } from '../own-result-window.ts';
import { mayScoreAnywhere } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type OwnResultWindow = {
  readonly gameId: string;
  readonly reopen: OwnResultOffer['reopen'];
};

export const readOwnResultOffers = defineCommand({
  name: 'games.read_own_result_offers',
  permission: 'games.score',
  // A games list is a page of games; more than this is not one list.
  input: z.object({ gameIds: z.array(z.uuid()).max(500) }),
  allowed: (context, _input, tx: TrackerTx) => mayScoreAnywhere(context, tx),
  run: async ({ context, input, tx }): Promise<Result<readonly OwnResultWindow[], never>> => {
    const windows = await ownResultWindows(context, tx, [...new Set(input.gameIds)]);
    return ok([...windows].map(([gameId, reopen]) => ({ gameId, reopen })));
  },
});
