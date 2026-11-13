// Adds a standings adjustment with its reason (S-10): a points deduction, a win
// awarded by ruling. It is one of the things the calculation reads, never a typed-in
// standing (A-12): the season's standings are worked out again at once, and the
// reason shows as a footnote under the table. An adjustment the calculation would
// leave out (it would take a count below zero, or changes nothing the season shows)
// is refused and nothing is saved. Needs `standings.adjust`; logged (A-6).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../../access/index.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { StandingsTx } from '../ports.ts';
import { rebuildSeason } from '../rebuild-season.ts';

export type AddAdjustmentError =
  | { readonly code: 'season-not-found' | 'team-not-found' }
  | { readonly code: 'adjustment-not-counted'; readonly reason: string };

const count = z.number().int().min(-1000).max(1000).default(0);

export const addAdjustment = defineCommand({
  name: 'standings.add_adjustment',
  permission: 'standings.adjust',
  input: z
    .object({
      seasonId: z.uuid(),
      teamId: z.uuid(),
      wins: count,
      losses: count,
      ties: count,
      points: z.number().int().min(-10000).max(10000).default(0),
      reason: z.string().trim().min(1).max(500),
    })
    .refine((a) => a.wins !== 0 || a.losses !== 0 || a.ties !== 0 || a.points !== 0, {
      message: 'An adjustment changes something.',
    }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ adjustmentId: string }, AddAdjustmentError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    if (context.accountId === null) return fail({ code: 'season-not-found' });
    const teams = await tx.standings.listTeams(input.seasonId);
    if (!teams.some((team) => team.teamId === input.teamId)) {
      return fail({ code: 'team-not-found' });
    }
    await tx.standings.lockSeason(input.seasonId);
    const adjustmentId = await tx.standings.addAdjustment(input.seasonId, {
      teamId: input.teamId,
      wins: input.wins,
      losses: input.losses,
      ties: input.ties,
      points: input.points,
      reason: input.reason,
      accountId: context.accountId,
    });
    const rebuilt = await rebuildSeason(tx, input.seasonId);
    const problem = rebuilt.problems.find((p) => p.kind === 'adjustment' && p.id === adjustmentId);
    // Refusing rolls the whole command back, the new adjustment with it.
    if (problem !== undefined) {
      return fail({ code: 'adjustment-not-counted', reason: problem.reason });
    }
    await recordActivity(tx, context, {
      action: 'standings.add_adjustment',
      target: { type: 'season', id: input.seasonId },
      details: { adjustment: adjustmentId, team: input.teamId },
    });
    return ok({ adjustmentId });
  },
});
