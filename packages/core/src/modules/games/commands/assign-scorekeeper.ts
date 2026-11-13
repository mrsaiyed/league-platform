// Assigns someone to score a game (P7 §5.1, P4 §4). In a league that scores assigned
// games only, this is what lets a scorekeeper score it; in any league it puts the
// game on their list. Only someone who may score the game at all can be assigned:
// a scorekeeper (or admin, or scheduler) whose role reaches the game's program.
import { z } from 'zod';
import { accessOfAccount, allows, recordActivity, scopeDetails } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { isClosed } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

export type AssignScorekeeperError = {
  readonly code: 'game-not-found' | 'game-closed' | 'cannot-score-game' | 'already-assigned';
};

export const assignScorekeeper = defineCommand({
  name: 'games.assign_scorekeeper',
  permission: 'games.manage',
  input: z.object({
    gameId: z.uuid(),
    // Lower case, as the database and the grants spell an account's id.
    accountId: z.uuid().transform((id) => id.toLowerCase()),
  }),
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.manage', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ gameId: string; accountId: string }, AssignScorekeeperError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (isClosed(game.status)) return fail({ code: 'game-closed' });
    const scope = await gameScope(tx, game.id);
    // Read fresh (T-75): someone whose role was removed a moment ago cannot be assigned.
    const scorer = await accessOfAccount(tx, input.accountId);
    if (scorer === undefined || !allows(scorer, 'games.score', scope)) {
      return fail({ code: 'cannot-score-game' });
    }
    if (!(await tx.games.assign(game.id, input.accountId))) {
      return fail({ code: 'already-assigned' });
    }
    await recordActivity(tx, context, {
      action: 'games.assign_scorekeeper',
      target: { type: 'game', id: game.id },
      details: { accountId: input.accountId, ...scopeDetails(scope) },
    });
    return ok({ gameId: game.id, accountId: input.accountId });
  },
});
