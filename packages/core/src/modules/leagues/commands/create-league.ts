// Creates a league, in the state draft (U-9), with its hidden default program (U-3,
// U-12) and, when one is given, its first season as the current one, all in one
// transaction: either everything is made or nothing is (T-260). For our own staff
// through an internal tool only: no page offers it yet. The context's league id is
// the NEW league's id, picked by the caller before the call (record 008: row-level
// security needs it set first).
//
// The first season is made here, by our staff, rather than by the owner with
// createSeason afterwards: the owner may never have signed in, so no command may act
// as them (a context comes from a session, never made up), and a league left with no
// season because a second step refused could be neither finished nor removed. The
// activity log names our staff for both, set up for the owner (`forOwnerAccountId`).
// The contact email and city (P3 §1 step 2, "Where") may be left out and given later.
//
// When a design is given (one of the starting designs, with the main, accent and
// highlight colors the league chose, step 2.187, record 073), the league's site and its
// first release are made in the same transaction, published by our staff for the owner;
// the `leagues.create` entry names the starting design. A league made without one has
// no release, and is drawn in the neutral design until one is published.
import {
  defaultSeasonRules,
  startingColors,
  startingDesignKeys,
  startingDesignWith,
  type SeasonRules,
  type StartingColors,
  type StartingDesignKey,
} from '@srleagues/contracts';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import {
  defineCommand,
  fail,
  ok,
  type CommandContext,
  type Result,
} from '../../../command/index.ts';
import { leagueCreated } from '../events.ts';
import { audiences, defaultProgramSlug, listedByDefault } from '../league-values.ts';
import { mayActAsPlatform } from '../policy.ts';
import type { LeagueRecord, LeaguesTx } from '../ports.ts';
import {
  gameRuleAnswers,
  withGameRuleAnswers,
  type GameRuleRefusal,
} from '../rules/game-rule-answers.ts';
import { isBlockedShortName, shortNameSchema } from '../short-names.ts';
import { namedTimeZone } from '../time-zone.ts';

export type CreateLeagueError =
  | {
      readonly code:
        | 'short-name-blocked'
        | 'short-name-taken'
        | 'league-exists'
        | 'owner-not-found';
    }
  | GameRuleRefusal;

/** The league, and its first season's id when one was made with it. */
export type CreatedLeague = LeagueRecord & { readonly firstSeasonId: string | null };

const day = z.iso.date();

/** P3 §1 step 4: a name, its short name, and rough dates, which are optional. */
const firstSeason = z
  .object({
    // The same limits as the seasons table (0003) and createSeason.
    slug: z
      .string()
      .max(60)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(120),
    startsOn: day.optional(),
    endsOn: day.optional(),
    /**
     * The game rules asked when the league is made (S-106, step 2.245), put into the
     * starting rules; given, the season's rules are saved with them, an answer left out
     * keeping the starting one.
     */
    gameRules: gameRuleAnswers.optional(),
  })
  .refine((s) => s.startsOn === undefined || s.endsOn === undefined || s.endsOn >= s.startsOn, {
    path: ['endsOn'],
  });

/** A named zone only, kept by its canonical name (time-zone.ts). */
const timeZone = z
  .string()
  .max(64)
  .transform((value, context) => {
    const name = namedTimeZone(value);
    if (name === undefined) {
      context.addIssue({ code: 'custom', message: 'not a named time zone' });
      return z.NEVER;
    }
    return name;
  });

export const createLeague = defineCommand({
  name: 'leagues.create',
  permission: 'platform-staff',
  input: z.object({
    slug: shortNameSchema,
    name: z.string().trim().min(1).max(120),
    timeZone,
    audience: z.enum(audiences),
    /** U-10: when left out, adult leagues are listed and the others are not. */
    listed: z.boolean().optional(),
    ownerAccountId: z.uuid(),
    /** How people reach the league (T3 §4); the same limits as the leagues table (0003). */
    contactEmail: z.email().max(320).optional(),
    /** Where the league plays (P3 §1 step 2); the same limits as the leagues table (0014). */
    city: z.string().trim().min(1).max(100).optional(),
    sportKey: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    /** Made in the default program, in draft, as the current season. */
    firstSeason: firstSeason.optional(),
    /** Its first site release: a starting design and the colors chosen in place of its own. */
    design: z
      .object({ startingDesign: z.enum(startingDesignKeys), colors: startingColors.optional() })
      .optional(),
  }),
  allowed: (context, _input, tx: LeaguesTx) => mayActAsPlatform(context, tx),
  run: async ({ context, input, tx, emit }): Promise<Result<CreatedLeague, CreateLeagueError>> => {
    if (isBlockedShortName(input.slug)) return fail({ code: 'short-name-blocked' });
    const answered =
      input.firstSeason?.gameRules === undefined
        ? undefined
        : withGameRuleAnswers(defaultSeasonRules(), input.firstSeason.gameRules);
    if (answered?.ok === false) return fail({ code: answered.code, question: answered.question });
    const created = await tx.leagues.createLeague({
      slug: input.slug,
      name: input.name,
      timeZone: input.timeZone,
      audience: input.audience,
      listed: input.listed ?? listedByDefault[input.audience],
      ownerAccountId: input.ownerAccountId,
      contactEmail: input.contactEmail ?? null,
      city: input.city ?? null,
      defaultProgram: { slug: defaultProgramSlug, name: input.name, sportKey: input.sportKey },
    });
    if (typeof created === 'string') return fail({ code: created });
    const setUp = { forOwnerAccountId: input.ownerAccountId };
    if (input.design !== undefined) await publishFirstDesign(tx, context, input.design);
    await recordActivity(tx, context, {
      action: 'leagues.create',
      target: { type: 'league', id: context.leagueId },
      details:
        input.design === undefined
          ? setUp
          : { ...setUp, startingDesign: input.design.startingDesign },
    });
    const firstSeasonId =
      input.firstSeason === undefined
        ? null
        : await makeFirstSeason(tx, input.firstSeason, answered?.rules);
    if (firstSeasonId !== null) {
      await recordActivity(tx, context, {
        action: 'leagues.create_season',
        target: { type: 'season', id: firstSeasonId },
        details: { ...setUp, current: true },
      });
    }
    emit({ type: leagueCreated, leagueId: context.leagueId });
    return ok({ ...created, firstSeasonId });
  },
});

/**
 * The new league's first site release, and its site pointed at it (T3 §10). A new league
 * has no release, so its number cannot be taken: that would be a fault, thrown so the
 * whole league is rolled back.
 */
async function publishFirstDesign(
  tx: LeaguesTx,
  context: CommandContext,
  design: { startingDesign: StartingDesignKey; colors?: StartingColors | undefined },
): Promise<void> {
  if (context.accountId === null) throw new Error('leagues.create: no account.');
  const released = await tx.leagues.publishSiteRelease({
    number: 1,
    startingDesign: design.startingDesign,
    design: startingDesignWith(design.startingDesign, design.colors),
    publishedByAccountId: context.accountId,
  });
  if (released === 'number-taken') {
    throw new Error('leagues.create: a new league already had a site release.');
  }
}

/**
 * The first season, in the default program just made, as its current one. A new
 * league has no other season, so neither a taken short name nor a missing program can
 * happen: either would be a fault, thrown so the whole league is rolled back.
 */
async function makeFirstSeason(
  tx: LeaguesTx,
  season: z.output<typeof firstSeason>,
  rules: SeasonRules | undefined,
): Promise<string> {
  const program = await tx.leagues.findProgram(undefined);
  if (program === undefined) throw new Error('leagues.create: the default program is missing.');
  const seasonId = await tx.leagues.createSeason({
    programId: program.id,
    slug: season.slug,
    name: season.name,
    startsOn: season.startsOn ?? null,
    endsOn: season.endsOn ?? null,
    // In the one statement that makes it (T-430): no second save, so the season's
    // version is a just-made season's and the league stays removable.
    ...(rules === undefined ? {} : { rules }),
  });
  if (seasonId === 'slug-taken') {
    throw new Error('leagues.create: a new league already had a season with that short name.');
  }
  if (!(await tx.leagues.setCurrentSeason(seasonId))) {
    throw new Error('leagues.create: the first season could not be made the current one.');
  }
  return seasonId;
}
