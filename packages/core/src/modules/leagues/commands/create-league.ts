// Creates a league, in the state draft (U-9), with its hidden default program (U-3,
// U-12), in one transaction. For our own staff through an internal tool only: no
// page offers it yet. The context's league id is the NEW league's id, picked by the
// caller before the call (record 008: row-level security needs it set first). The
// first season is not created here; an organizer adds it (createSeason).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueCreated } from '../events.ts';
import { audiences, defaultProgramSlug, listedByDefault } from '../league-values.ts';
import { mayActAsPlatform } from '../policy.ts';
import type { LeagueRecord, LeaguesTx } from '../ports.ts';
import { isBlockedShortName, shortNameSchema } from '../short-names.ts';

export type CreateLeagueError = {
  readonly code: 'short-name-blocked' | 'short-name-taken' | 'league-exists' | 'owner-not-found';
};

const validTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const createLeague = defineCommand({
  name: 'leagues.create',
  input: z.object({
    slug: shortNameSchema,
    name: z.string().trim().min(1).max(120),
    timeZone: z.string().min(1).max(64).refine(validTimeZone),
    audience: z.enum(audiences),
    /** U-10: when left out, adult leagues are listed and the others are not. */
    listed: z.boolean().optional(),
    ownerAccountId: z.uuid(),
    sportKey: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  }),
  allowed: (context, _input, tx: LeaguesTx) => mayActAsPlatform(context, tx),
  run: async ({ context, input, tx, emit }): Promise<Result<LeagueRecord, CreateLeagueError>> => {
    if (isBlockedShortName(input.slug)) return fail({ code: 'short-name-blocked' });
    const created = await tx.leagues.createLeague({
      slug: input.slug,
      name: input.name,
      timeZone: input.timeZone,
      audience: input.audience,
      listed: input.listed ?? listedByDefault[input.audience],
      ownerAccountId: input.ownerAccountId,
      defaultProgram: { slug: defaultProgramSlug, name: input.name, sportKey: input.sportKey },
    });
    if (typeof created === 'string') return fail({ code: created });
    await recordActivity(tx, context, {
      action: 'leagues.create',
      target: { type: 'league', id: context.leagueId },
    });
    emit({ type: leagueCreated, leagueId: context.leagueId });
    return ok(created);
  },
});
