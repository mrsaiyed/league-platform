// Moves a league between draft, live, archived and suspended (U-9) along the
// allowed changes in league-states.ts. The owner publishes and archives; only our
// staff suspend and lift a suspension. Anything else is an "illegal-transition".
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueStatusChanged } from '../events.ts';
import { findTransition } from '../league-states.ts';
import { leagueStatuses, type LeagueStatus } from '../league-values.ts';
import { mayActAsPlatform, mayChangeLeagueSettings } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type SetLeagueStatusError = {
  readonly code: 'illegal-transition' | 'changed-since-read';
};

export const setLeagueStatus = defineCommand({
  name: 'leagues.set_status',
  input: z.object({ status: z.enum(leagueStatuses), version: z.number().int().positive() }),
  allowed: async (context, input, tx: LeaguesTx) => {
    const league = await tx.leagues.currentLeague();
    if (league === undefined) return false;
    // A change not in the table is refused by the command with its own error, to
    // anyone who could have made some change of the owner's.
    if (findTransition(league.status, input.status)?.by === 'platform') {
      return mayActAsPlatform(context, tx);
    }
    return mayChangeLeagueSettings(context, tx);
  },
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ status: LeagueStatus; version: number }, SetLeagueStatusError>> => {
    const league = await tx.leagues.currentLeague();
    if (league === undefined) throw new Error('leagues.set_status: the league is gone.');
    if (league.version !== input.version) return fail({ code: 'changed-since-read' });
    if (findTransition(league.status, input.status) === undefined) {
      return fail({ code: 'illegal-transition' });
    }
    const version = await tx.leagues.setStatus(input.status, input.version);
    if (version === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'leagues.set_status',
      target: { type: 'league', id: context.leagueId },
      details: { status: input.status },
    });
    emit({ type: leagueStatusChanged, leagueId: context.leagueId });
    return ok({ status: input.status, version });
  },
});
