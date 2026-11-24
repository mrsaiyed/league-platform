// One game's own format (step 2.119; P7 §5.1, S-21, S-35, S-39): what the tracker's start
// confirmation and the admin's games area ask of
// `/api/v1/leagues/{leagueId}/games/{game}/format`, and what the server answers. GET reads
// the format; PUT gives the game a format, or with `format: null` returns it to its
// season's. Signed out and a body that is not a request are answered with the tracker's
// own `TrackerRefusal` (tracker-protocol.ts); every other answer is a `GameFormatReply` at
// the status `gameFormatStatus` gives it, and a caller takes it as the server's word only
// with that body at that status (`ownGameFormatReply`).
import { z } from 'zod';
import { FORMAT_FACTS, GAME_FORMAT_PRESETS, GameFormatRules } from './season-rules.ts';

const Ms = z.number().int().nonnegative();

export const GameFormatChangeRequest = z.strictObject({
  /** The game's version from the read: the server refuses if the game changed since. */
  version: z.number().int().nonnegative(),
  /** The game's own format, or null for its season's. */
  format: GameFormatRules.nullable(),
});
export type GameFormatChangeRequest = z.infer<typeof GameFormatChangeRequest>;

/** Why reading or changing a game's format was refused, as fixed codes: the screen picks the words. */
export const gameFormatRefusals = [
  /** Neither manages this league's games nor scores this game. */
  'not-allowed',
  /** No such game in this league. */
  'unknown-game',
  /** The game changed since it was read: read it again. */
  'changed-since-read',
  /** May see the format but not change it. */
  'no-permission',
  /** A scorekeeper, and the league does not let scorekeepers change a game's format. */
  'setting-off',
  /** The first play or clock tap has happened: the format is fixed (B3). */
  'under-way',
  /** The game is over (a final score, a box score, or ended at the table). */
  'finished',
  /** Its season is archived, so read-only (O-12, step 2.130): only a correction with a reason. */
  'season-archived',
] as const;
export type GameFormatRefusal = (typeof gameFormatRefusals)[number];

const FormatFactReply = z.strictObject({
  fact: z.enum(FORMAT_FACTS),
  value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
});

const FormatChangeReply = z.union([
  z.strictObject({ may: z.literal(true), as: z.enum(['admin', 'scorekeeper']) }),
  z.strictObject({
    may: z.literal(false),
    reason: z.enum(['no-permission', 'setting-off', 'under-way', 'finished']),
  }),
]);

export const GameFormatView = z.strictObject({
  version: z.number().int().nonnegative(),
  given: GameFormatRules.nullable(),
  season: GameFormatRules,
  applies: GameFormatRules,
  source: z.enum(['fixed', 'given', 'season']),
  facts: z.array(FormatFactReply).readonly(),
  change: FormatChangeReply,
  presets: z
    .array(z.strictObject({ preset: z.enum(GAME_FORMAT_PRESETS), format: GameFormatRules }))
    .readonly(),
});
export type GameFormatView = z.infer<typeof GameFormatView>;

export const GameFormatReply = z.discriminatedUnion('status', [
  /** The game's format as it stands (after a change, as it stands now). */
  z.strictObject({ status: z.literal('format'), view: GameFormatView, sentAt: Ms }),
  z.strictObject({ status: z.literal('refused'), code: z.enum(gameFormatRefusals), sentAt: Ms }),
]);
export type GameFormatReply = z.infer<typeof GameFormatReply>;

/** The status each answer is sent with. */
export function gameFormatStatus(reply: GameFormatReply): number {
  if (reply.status === 'format') return 200;
  if (reply.code === 'not-allowed') return 403;
  if (reply.code === 'unknown-game') return 404;
  return 409;
}

/** The reply `body` is when it is our server's own at its own `status`; null for anything else. */
export const ownGameFormatReply = (status: number, body: unknown): GameFormatReply | null => {
  const read = GameFormatReply.safeParse(body);
  return read.success && gameFormatStatus(read.data) === status ? read.data : null;
};
