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
});

/** Mirrors `Command` in packages/sports/src/basketball/live.ts, which applies the rules. */
export const Command = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('lineup'), side: Side, playerIds: z.array(Id).min(1).max(5) }),
  z.strictObject({
    type: z.literal('score'),
    side: Side,
    playerId: Id,
    points: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({ type: z.literal('foul'), side: Side, playerId: Id }),
  z.strictObject({ type: z.literal('unfoul'), side: Side, playerId: Id }),
  z.strictObject({ type: z.literal('sub'), side: Side, inId: Id, outId: Id }),
  z.strictObject({ type: z.literal('period'), period: z.number().int().min(1).max(20) }),
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('pause') }),
  z.strictObject({ type: z.literal('set-clock'), ms: z.number().int().min(0).max(3_600_000) }),
  z.strictObject({ type: z.literal('undo') }),
  z.strictObject({ type: z.literal('redo') }),
  z.strictObject({ type: z.literal('rules'), rules: Rules }),
  z.strictObject({ type: z.literal('colors'), swapped: z.boolean() }),
  z.strictObject({ type: z.literal('end') }),
  z.strictObject({ type: z.literal('reopen') }),
  z.strictObject({ type: z.literal('reset') }),
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

export type PlayerInput = z.infer<typeof PlayerInput>;
export type Envelope = z.infer<typeof Envelope>;
