// Removes a round from the season's schedule draft (P7 §4.3, step 2.160). Only a round no
// game is in can go: a game of the draft in it is refused by the schedule rules
// (`round-has-games`), and a game the draft does not hold (in the bin, with no date yet,
// or removed by the draft, which keeps its round in the bin) as `round-in-use`. The round
// itself is removed when the draft is published.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import { roundsStillInUse } from '../round-use.ts';

export type RemoveDraftRoundError = DraftEditError;

export const removeDraftRound = defineCommand({
  name: 'scheduling.remove_draft_round',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, roundId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, RemoveDraftRoundError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.remove_draft_round',
      input,
      change: { kind: 'remove-round', roundId: input.roundId },
      check: async (sofar) => {
        // The rules say it best when the draft's own games are in the round.
        if (sofar.games.some((g) => g.roundId === input.roundId)) return undefined;
        const used = await roundsStillInUse(tx, input.seasonId, [input.roundId], sofar);
        return used.has(input.roundId) ? { code: 'round-in-use' } : undefined;
      },
    }),
});
