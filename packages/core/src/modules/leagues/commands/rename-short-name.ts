// Changes the short name in the league's address (U-7). The old name keeps
// forwarding to the new one for 12 months and is held for this league meanwhile (the
// database refuses it to anyone else). Not the name the league shows: that is
// setLeagueName.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueShortNameChanged } from '../events.ts';
import { shortNameForwardingMonths } from '../league-values.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';
import { isBlockedShortName, shortNameSchema } from '../short-names.ts';

export type RenameShortNameError = {
  readonly code: 'short-name-blocked' | 'short-name-taken' | 'changed-since-read';
};

export const renameShortName = defineCommand({
  name: 'leagues.rename_short_name',
  input: z.object({ slug: shortNameSchema, version: z.number().int().positive() }),
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ slug: string; version: number }, RenameShortNameError>> => {
    const league = await tx.leagues.currentLeague();
    if (league === undefined) throw new Error('leagues.rename_short_name: the league is gone.');
    if (league.version !== input.version) return fail({ code: 'changed-since-read' });
    if (league.slug === input.slug) return ok({ slug: league.slug, version: league.version });
    if (isBlockedShortName(input.slug)) return fail({ code: 'short-name-blocked' });
    const version = await tx.leagues.renameShortName(
      input.slug,
      input.version,
      shortNameForwardingMonths,
    );
    if (version === undefined) return fail({ code: 'changed-since-read' });
    if (version === 'taken') return fail({ code: 'short-name-taken' });
    await recordActivity(tx, context, {
      action: 'leagues.rename_short_name',
      target: { type: 'league', id: context.leagueId },
      details: { slug: input.slug },
    });
    emit({ type: leagueShortNameChanged, leagueId: context.leagueId });
    return ok({ slug: input.slug, version });
  },
});
