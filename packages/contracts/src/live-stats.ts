import { z } from 'zod';

const Side = z.enum(['home', 'away']);
const Id = z.uuid();

/** Blank, 0–99, or 00 (a different jersey from 0). */
export const Jersey = z
  .string()
  .trim()
  .regex(/^(?:|0|00|[1-9][0-9]?)$/, 'Use a jersey number from 0–99 or 00.');

export const PlayerInput = z
  .strictObject({ name: z.string().trim().max(60), jersey: Jersey })
  .refine((p) => p.name !== '' || p.jersey !== '', 'Enter a name or a jersey number.');

export const Rules = z.strictObject({
  periods: z.union([z.literal(2), z.literal(4)]),
  periodSeconds: z.number().int().min(60).max(3600),
  overtimeSeconds: z.number().int().min(60).max(1800),
  bonusFouls: z.number().int().min(1).max(30),
  doubleBonusFouls: z.number().int().min(2).max(40).nullable(),
  // Optional: a page from before timeouts were tracked sends none, and gets TCSAAL's.
  fullTimeouts: z.number().int().min(0).max(10).optional(),
  shortTimeouts: z.number().int().min(0).max(10).optional(),
  timeoutsPer: z.enum(['game', 'half']).optional(),
  overtimeTimeouts: z.number().int().min(0).max(5).optional(),
  timeoutsCarry: z.boolean().optional(),
});

/**
 * The rules the platform's tracker sends (T-128): the Al-Hadi tracker's, plus the clock
 * mode, which is absent for a stop clock as every game before the mode existed, and the
 * last-minutes stop clock, the mercy lead and the personal foul limit, each off when
 * absent or null. Their limits match the season rules document (./season-rules.ts); a
 * test keeps the two in step. The engine also keeps the stop clock within a period.
 */
export const PlatformRules = Rules.extend({
  clockMode: z.enum(['stop', 'running']).optional(),
  stopClockLastSeconds: z.number().int().min(1).max(600).nullable().optional(),
  stopClockScope: z.enum(['period', 'half', 'game']).optional(),
  mercyLead: z.number().int().min(1).max(100).nullable().optional(),
  playerFoulLimit: z.number().int().min(1).max(20).nullable().optional(),
});

/** The commands both trackers send. */
const sharedCommands = [
  z.strictObject({ type: z.literal('lineup'), side: Side, playerIds: z.array(Id).min(1).max(5) }),
  z.strictObject({
    type: z.literal('score'),
    side: Side,
    playerId: Id,
    points: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({ type: z.literal('foul'), side: Side, playerId: Id }),
  z.strictObject({ type: z.literal('unfoul'), side: Side, playerId: Id }),
  z.strictObject({ type: z.literal('turnover'), side: Side, playerId: Id }),
  z.strictObject({ type: z.literal('unturnover'), side: Side, playerId: Id }),
  z.strictObject({ type: z.literal('team-turnover'), side: Side }),
  z.strictObject({ type: z.literal('team-unturnover'), side: Side }),
  z.strictObject({
    type: z.literal('timeout'),
    side: Side,
    seconds: z.union([z.literal(60), z.literal(30)]),
  }),
  z.strictObject({ type: z.literal('untimeout'), side: Side }),
  z.strictObject({ type: z.literal('sub'), side: Side, inId: Id, outId: Id }),
  z.strictObject({ type: z.literal('period'), period: z.number().int().min(1).max(20) }),
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('pause') }),
  z.strictObject({ type: z.literal('set-clock'), ms: z.number().int().min(0).max(3_600_000) }),
  z.strictObject({ type: z.literal('undo') }),
  z.strictObject({ type: z.literal('redo') }),
  z.strictObject({ type: z.literal('colors'), swapped: z.boolean() }),
  z.strictObject({ type: z.literal('end') }),
  z.strictObject({ type: z.literal('reopen') }),
  z.strictObject({ type: z.literal('reset') }),
] as const;

/**
 * What the Al-Hadi tracker's server takes (apps/live-stats). It must not change while
 * that tracker is live (T-16): it refuses the clock mode and its switch.
 */
export const Command = z.discriminatedUnion('type', [
  ...sharedCommands,
  z.strictObject({ type: z.literal('rules'), rules: Rules }),
]);

/**
 * Mirrors `Command` in packages/sports/src/basketball/live.ts, which applies the rules:
 * what the platform's server takes (step 2.68). Adds the clock mode and its mid-game
 * switch (S-21, T-128), undone like any play, and the three rules of step 2.67. The
 * mercy rule needs no command of its own: the scorer switches back with `clock-mode`.
 */
export const PlatformCommand = z.discriminatedUnion('type', [
  ...sharedCommands,
  z.strictObject({ type: z.literal('rules'), rules: PlatformRules }),
  z.strictObject({ type: z.literal('clock-mode'), mode: z.enum(['stop', 'running']) }),
]);

/**
 * One scorer action. `commandId` makes a retry after a lost response safe; `at`
 * is when it was tapped, in server time, so an action that waited out a dropped
 * connection still lands on the game clock where it happened.
 */
export const Envelope = z.strictObject({
  commandId: Id,
  at: z.number().int().nonnegative().optional(),
  input: Command,
});

/** One scorer action as the platform's tracker sends it; see `Envelope`. */
export const PlatformEnvelope = Envelope.extend({ input: PlatformCommand });

export type PlayerInput = z.infer<typeof PlayerInput>;
export type Envelope = z.infer<typeof Envelope>;
export type PlatformEnvelope = z.infer<typeof PlatformEnvelope>;
