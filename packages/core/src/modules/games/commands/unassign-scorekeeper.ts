// Takes someone off a game they were assigned to score (P7 §5.1). In a league that
// scores assigned games only, they may no longer score it from that moment (T-75).
// Works whatever the game's state, whether or not they still hold a role, and in an
// archived or suspended league too: taking access away must always work. It still
// needs games.manage at the game's program.
import { z } from 'zod';
import { hasPermission, recordActivity, scopeDetails } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameScope } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

export type UnassignScorekeeperError = { readonly code: 'game-not-found' | 'not-assigned' };

export const unassignScorekeeper = defineCommand({
  name: 'games.unassign_scorekeeper',
  permission: 'games.manage',
  input: z.object({
    gameId: z.uuid(),
    accountId: z.uuid().transform((id) => id.toLowerCase()),
  }),
  allowed: async (context, input, tx: GamesTx) =>
    hasPermission(context, tx, 'games.manage', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ gameId: string; accountId: string }, UnassignScorekeeperError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined) return fail({ code: 'game-not-found' });
    if (!(await tx.games.unassign(game.id, input.accountId))) {
      return fail({ code: 'not-assigned' });
    }
    await recordActivity(tx, context, {
      action: 'games.unassign_scorekeeper',
      target: { type: 'game', id: game.id },
      details: { accountId: input.accountId, ...scopeDetails(await gameScope(tx, game.id)) },
    });
    return ok({ gameId: game.id, accountId: input.accountId });
  },
});
