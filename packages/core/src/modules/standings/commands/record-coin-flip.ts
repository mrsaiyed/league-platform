// Records the order a coin flip gave teams level after every tiebreaker (P7 §1, S-89,
// T-314): the teams, winner first, how it was made (flipped at the table, or "Flip for
// us", drawn by the server) and an optional note. Only a set of teams that is level
// after every tiebreaker right now is accepted; a flip already recorded for the same
// teams goes to the bin, so changing the order is recording it again. The season's
// standings are worked out again at once and the note under the table says a coin flip
// put them in this order. Needs `standings.adjust`; logged (A-6).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../../access/index.ts';
import { flipFor, levelGroups, sameTeams } from '../level-groups.ts';
import { mayAdjustStandings } from '../policy.ts';
import type { StandingsTx } from '../ports.ts';
import { calculateSeason, rebuildSeason } from '../rebuild-season.ts';
import { unexplainedInArchivedSeason } from '../archived-season.ts';

export type RecordCoinFlipError = {
  readonly code: 'season-not-found' | 'not-allowed' | 'teams-not-level';
};

export const recordCoinFlip = defineCommand({
  name: 'standings.record_coin_flip',
  permission: 'standings.adjust',
  input: z.object({
    seasonId: z.uuid(),
    teamIds: z
      .array(z.uuid())
      .min(2)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each team once.' }),
    method: z.enum(['by-hand', 'drawn']),
    note: z.string().trim().min(1).max(500).optional(),
  }),
  allowed: (context, input, tx: StandingsTx) => mayAdjustStandings(context, tx, input.seasonId),
  refusedInArchivedSeason: (input, tx) =>
    unexplainedInArchivedSeason(input.seasonId, input.note, tx),
  run: async ({ context, input, tx }): Promise<Result<{ flipId: string }, RecordCoinFlipError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    if (context.accountId === null) return fail({ code: 'not-allowed' });
    await tx.standings.lockSeason(input.seasonId);
    const level = await calculateSeason(tx, input.seasonId, undefined, { withoutFlips: true });
    const groups = level === undefined ? [] : levelGroups(level.standings);
    if (!groups.some((group) => sameTeams(group, input.teamIds))) {
      return fail({ code: 'teams-not-level' });
    }
    const flips = await tx.standings.listCoinFlips(input.seasonId);
    const replaced = flipFor(flips, input.teamIds);
    if (replaced !== undefined) await tx.standings.binCoinFlip(input.seasonId, replaced.id);
    const flipId = await tx.standings.addCoinFlip(input.seasonId, {
      teamIds: input.teamIds,
      method: input.method,
      note: input.note ?? null,
      accountId: context.accountId,
    });
    await rebuildSeason(tx, input.seasonId);
    await recordActivity(tx, context, {
      action: 'standings.record_coin_flip',
      target: { type: 'season', id: input.seasonId },
      details: {
        flip: flipId,
        teams: input.teamIds.join(','),
        method: input.method,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(replaced === undefined ? {} : { replaced: replaced.id }),
      },
    });
    return ok({ flipId });
  },
});
