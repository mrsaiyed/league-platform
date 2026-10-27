import { z } from 'zod';

export const Side = z.enum(['home', 'away']);
export const Player = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  jersey: z
    .string()
    .trim()
    .regex(/^(?:00|0|[1-9][0-9]?)$/, 'Use a jersey number from 0–99 or 00.'),
  side: Side,
});
export const Rules = z.strictObject({
  periods: z.number().int().min(1).max(4),
  periodSeconds: z.number().int().min(60).max(1800),
  overtimeSeconds: z.number().int().min(60).max(600),
});
export const Command = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('lineup'),
    side: Side,
    playerIds: z.array(z.uuid()).min(1).max(5),
  }),
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('pause') }),
  z.strictObject({
    type: z.literal('score'),
    playerId: z.uuid(),
    points: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({ type: z.literal('foul'), playerId: z.uuid() }),
  z.strictObject({ type: z.literal('substitute'), side: Side, outId: z.uuid(), inId: z.uuid() }),
  z.strictObject({ type: z.literal('undo'), targetId: z.uuid() }),
  z.strictObject({
    type: z.literal('clock'),
    seconds: z.number().int().min(0).max(1800),
    reason: z.string().trim().min(5).max(300),
  }),
  z.strictObject({ type: z.literal('next-period') }),
  z.strictObject({ type: z.literal('finalize') }),
  z.strictObject({ type: z.literal('reopen'), reason: z.string().trim().min(5).max(300) }),
]);
export const Envelope = z.strictObject({
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  input: Command,
});
export const RosterInput = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  players: z
    .array(
      z.strictObject({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(100),
        jersey: Player.shape.jersey,
      }),
    )
    .max(30),
});
export const CreateGame = z.strictObject({
  commandId: z.uuid(),
  opponent: z.string().trim().min(1).max(100),
  trackedSide: Side,
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  venue: z.string().trim().max(160),
  sourceUrl: z.union([
    z.literal(''),
    z.url().refine((s) => s.startsWith('https://'), 'Use an HTTPS source link.'),
  ]),
  rules: Rules,
  rulesConfirmed: z.boolean(),
  opponents: z
    .array(z.strictObject({ jersey: Player.shape.jersey, name: z.string().trim().max(100) }))
    .min(1)
    .max(30),
});
export type Side = z.infer<typeof Side>;
export type Player = z.infer<typeof Player>;
export type Rules = z.infer<typeof Rules>;
export type Command = z.infer<typeof Command>;
export type Envelope = z.infer<typeof Envelope>;
