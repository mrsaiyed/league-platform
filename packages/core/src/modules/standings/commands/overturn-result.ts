// Overturns a decided game's result by ruling (S-10, the numbers audit's M6): the team
// that won it takes one win off and one loss on, the team that lost it the other way
// round, under one reason. Both halves are saved together as a pair of adjustments, so
// the two can never exist apart: taking either off takes both (the store bins a pair
// together). The game itself keeps its score (A-12): an adjustment is one of the
// things the calculation reads, and the public table shows the reason as a footnote
// on both rows. Needs `standings.adjust`; logged (A-6) with the game it names.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../../access/index.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { StandingsTx } from '../ports.ts';
import { rebuildSeason } from '../rebuild-season.ts';

export type OverturnResultError =
  | { readonly code: 'season-not-found' | 'game-not-found' | 'game-has-no-winner' }
  | { readonly code: 'not-allowed' }
  | { readonly code: 'adjustment-not-counted'; readonly reason: string };

export const overturnResult = defineCommand({
  name: 'standings.overturn_result',
  permission: 'standings.adjust',
  input: z.object({
    seasonId: z.uuid(),
    gameId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
  }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ adjustmentIds: readonly string[] }, OverturnResultError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    if (context.accountId === null) return fail({ code: 'not-allowed' });
    const game = (await tx.games.listDecided(input.seasonId)).find((g) => g.id === input.gameId);
    if (game === undefined) return fail({ code: 'game-not-found' });
    const winner = winnerOf(game);
    if (winner === null) return fail({ code: 'game-has-no-winner' });
    const loser = winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    await tx.standings.lockSeason(input.seasonId);
    const half = (teamId: string, wins: number) => ({
      teamId,
      wins,
      losses: -wins,
      ties: 0,
      points: 0,
      reason: input.reason,
      accountId: context.accountId ?? '',
    });
    const first = await tx.standings.addAdjustment(input.seasonId, half(winner, -1));
    const second = await tx.standings.addAdjustment(input.seasonId, {
      ...half(loser, 1),
      pairedWith: first,
    });
    const rebuilt = await rebuildSeason(tx, input.seasonId);
    const problem = rebuilt.problems.find(
      (p) => p.kind === 'adjustment' && (p.id === first || p.id === second),
    );
    // Refusing rolls the whole command back, both halves with it.
    if (problem !== undefined) {
      return fail({ code: 'adjustment-not-counted', reason: problem.reason });
    }
    await recordActivity(tx, context, {
      action: 'standings.overturn_result',
      target: { type: 'season', id: input.seasonId },
      details: {
        adjustment: first,
        paired: second,
        game: input.gameId,
        team: loser,
        from: winner,
        reason: input.reason,
      },
    });
    return ok({ adjustmentIds: [first, second] });
  },
});

/** The winner the decided game's scores give, or the one its forfeit names. */
function winnerOf(game: {
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
}): string | null {
  if (game.homeScore === null || game.awayScore === null) return null;
  if (game.homeScore > game.awayScore) return game.homeTeamId;
  if (game.awayScore > game.homeScore) return game.awayTeamId;
  return null;
}
