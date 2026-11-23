// "Put it back" (P7 §4.3, step 2.185): drops the draft's removal of a game, so the draft
// holds it again as it last held it, whatever has happened to the game since (played,
// postponed, cancelled): it only gives the draft the game back. A game whose round the
// draft has removed since comes back with no round (S-60). Refused, changing nothing, when
// the draft does not remove the game, or when it is a new game of a team that has left.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type PutBackDraftGameError = DraftEditError;

export const putBackDraftGame = defineCommand({
  name: 'scheduling.put_back_draft_game',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, gameId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, PutBackDraftGameError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.put_back_draft_game',
      input,
      change: { kind: 'put-back-game', gameId: input.gameId },
      // A game the published schedule does not hold comes back as a new game, so not for a
      // team that has left the league (S-87). A published game the draft removes comes back:
      // it is the admin's to forfeit or cancel.
      check: async (sofar, published) => {
        if (published.games.some((g) => g.id === input.gameId)) return undefined;
        const was = sofar.removedGames?.find((g) => g.id === input.gameId);
        if (was === undefined) return undefined;
        const left = await tx.scheduling.leftTeamsOfSeason(input.seasonId, [
          was.homeTeamId,
          was.awayTeamId,
        ]);
        return left.length > 0 ? { code: 'team-left', teamIds: left } : undefined;
      },
    }),
});
