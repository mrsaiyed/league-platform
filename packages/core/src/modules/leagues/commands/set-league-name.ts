// Sets the name a league shows (not its short name in addresses, which step 1.11's
// rename handles with forwarding). The save names the version it started from and
// is refused if someone else saved since (T-46).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueNameChanged } from '../events.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type ChangedSinceRead = { readonly code: 'changed-since-read' };
export type LeagueName = { readonly name: string; readonly version: number };

const changedSinceRead: ChangedSinceRead = { code: 'changed-since-read' };

export const setLeagueName = defineCommand({
  name: 'leagues.set_name',
  // The same limits as the leagues table (0003).
  input: z.object({
    name: z.string().trim().min(1).max(120),
    version: z.number().int().positive(),
  }),
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx),
  run: async ({ context, input, tx, emit }): Promise<Result<LeagueName, ChangedSinceRead>> => {
    const league = await tx.leagues.currentLeague();
    // The policy just read it in this same transaction.
    if (league === undefined) throw new Error('leagues.set_name: the league is gone.');
    if (league.version !== input.version) return fail(changedSinceRead);
    if (league.name === input.name) return ok({ name: league.name, version: league.version });
    const version = await tx.leagues.setName(input.name, input.version);
    if (version === undefined) return fail(changedSinceRead);
    emit({ type: leagueNameChanged, leagueId: context.leagueId });
    return ok({ name: input.name, version });
  },
});
