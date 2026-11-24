// Removes a round from the season's schedule draft (P7 §4.3, steps 2.160 and 2.181). Only
// a round no game is in can go: a game of the draft in it is refused by the schedule rules
// (`round-has-games`), and a game with no date yet, which the draft does not hold, as
// `round-in-use`. A game in the bin does not hold its round, nor does one the draft
// removes (S-60): when the draft is published the round is removed and those games, in
// the bin by then, lose their round.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import { roundsStillInUse } from '../round-use.ts';
import { seasonArchivedForSchedule } from '../archived-season.ts';

export type RemoveDraftRoundError = DraftEditError;

export const removeDraftRound = defineCommand({
  name: 'scheduling.remove_draft_round',
  permission: 'schedule.edit',
  refusedInArchivedSeason: seasonArchivedForSchedule,
  input: z.object({ ...draftBasis, roundId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, RemoveDraftRoundError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.remove_draft_round',
      input,
      change: { kind: 'remove-round', roundId: input.roundId },
      check: async (sofar, published) => {
        // The rules say it best when the draft's own games are in the round.
        if (sofar.games.some((g) => g.roundId === input.roundId)) return undefined;
        const used = await roundsStillInUse(tx, input.seasonId, [input.roundId], published, sofar);
        return used.has(input.roundId) ? { code: 'round-in-use' } : undefined;
      },
    }),
});
