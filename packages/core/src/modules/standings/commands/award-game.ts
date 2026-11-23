// Awards a game that was not played to one team by ruling (S-10, S-85, the numbers
// audit's M6): the team it is awarded to gets one win, the other one loss, and each one
// game played, under one reason, so both records still add up. Both halves are saved
// together as a pair of adjustments, so the two can never exist apart: taking either
// off takes both. Needs `standings.adjust`; logged (A-6).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../../access/index.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { StandingsTx } from '../ports.ts';
import { rebuildSeason } from '../rebuild-season.ts';

export type AwardGameError =
  | { readonly code: 'season-not-found' | 'team-not-found' | 'same-team' | 'not-allowed' }
  | { readonly code: 'adjustment-not-counted'; readonly reason: string };

export const awardGame = defineCommand({
  name: 'standings.award_game',
  permission: 'standings.adjust',
  input: z.object({
    seasonId: z.uuid(),
    winnerTeamId: z.uuid(),
    loserTeamId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
  }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ adjustmentIds: readonly string[] }, AwardGameError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    if (context.accountId === null) return fail({ code: 'not-allowed' });
    if (input.winnerTeamId === input.loserTeamId) return fail({ code: 'same-team' });
    const teams = await tx.standings.listTeams(input.seasonId);
    const known = (id: string) => teams.some((team) => team.teamId === id);
    if (!known(input.winnerTeamId) || !known(input.loserTeamId)) {
      return fail({ code: 'team-not-found' });
    }
    await tx.standings.lockSeason(input.seasonId);
    const half = (teamId: string, wins: number, losses: number) => ({
      teamId,
      wins,
      losses,
      ties: 0,
      points: 0,
      gamesPlayed: 1,
      reason: input.reason,
      accountId: context.accountId ?? '',
    });
    const first = await tx.standings.addAdjustment(input.seasonId, half(input.winnerTeamId, 1, 0));
    const second = await tx.standings.addAdjustment(input.seasonId, {
      ...half(input.loserTeamId, 0, 1),
      pairedWith: first,
    });
    const rebuilt = await rebuildSeason(tx, input.seasonId);
    const problem = rebuilt.problems.find(
      (p) => p.kind === 'adjustment' && (p.id === first || p.id === second),
    );
    if (problem !== undefined) {
      return fail({ code: 'adjustment-not-counted', reason: problem.reason });
    }
    await recordActivity(tx, context, {
      action: 'standings.award_game',
      target: { type: 'season', id: input.seasonId },
      details: {
        adjustment: first,
        paired: second,
        team: input.winnerTeamId,
        against: input.loserTeamId,
        reason: input.reason,
      },
    });
    return ok({ adjustmentIds: [first, second] });
  },
});
