// The divisions of a season, in order, for the season settings screen (P7 §1). It
// changes nothing, but runs in the same shape as a command (record 014). Reading is
// allowed in a league that is archived or suspended too.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { mayChangeLeagueSettings, seasonScope } from '../policy.ts';
import type { DivisionRecord, LeaguesTx } from '../ports.ts';

export const listDivisions = defineCommand({
  name: 'leagues.list_divisions',
  permission: 'divisions.manage',
  input: z.object({ seasonId: z.uuid() }),
  allowed: async (context, input, tx: LeaguesTx) =>
    mayChangeLeagueSettings(context, tx, 'divisions.manage', await seasonScope(tx, input.seasonId)),
  run: async ({ input, tx }): Promise<Result<readonly DivisionRecord[], never>> =>
    ok(await tx.divisions.list(input.seasonId)),
});
