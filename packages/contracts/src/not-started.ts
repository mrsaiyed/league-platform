// Marking a game not started (step 2.121, S-40; record 061, T-264): what the tracker or
// an admin's page posts to `POST /api/v1/leagues/{leagueId}/games/{game}/not-started`,
// and what the server answers. Signed out and a body that is not a request are answered
// with the tracker's own `TrackerRefusal` (tracker-protocol.ts); every other answer is a
// `NotStartedReply` at the status `notStartedStatus` gives it, and a caller takes a
// refusal as the server's word only with that body at that status (`ownNotStartedReply`).
import { z } from 'zod';

const Ms = z.number().int().nonnegative();

/**
 * Why a game is marked not started, from a fixed list: the activity log keeps ids and
 * fixed words only (A-6, 0004), so the reason is chosen, never typed, as R-23's is.
 */
export const notStartedReasons = [
  'startedByMistake',
  'onlyTrying',
  'wrongGame',
  'wrongFormat',
  'other',
] as const;
export type NotStartedReason = (typeof notStartedReasons)[number];

export const NotStartedRequest = z.strictObject({
  /**
   * The sequence number of the last play the asker has seen (the tracker's state's). The
   * server refuses if the game has moved on since, so nobody clears plays they have not
   * seen.
   */
  sequence: z.number().int().nonnegative(),
  /**
   * Why, from the fixed list. Needed once a basket, foul or turnover stands (S-40), and
   * kept in the activity log, never shown publicly; kept when given at other times too.
   */
  reason: z.enum(notStartedReasons).optional(),
});
export type NotStartedRequest = z.infer<typeof NotStartedRequest>;

/** Why marking a game not started was refused, as fixed codes: the screen picks the words. */
export const notStartedRefusals = [
  /** May not score this game; or a basket, foul or turnover stands and may not correct games. */
  'not-allowed',
  /** No such game in this league. */
  'unknown-game',
  /** The game's plays moved on since the asker saw them: load them and look again. */
  'changed-since-read',
  /** The game has not started: there is nothing to clear. */
  'game-not-started',
  /** The tracker ended the game: reopening it is the way back. */
  'game-final',
  /** Final once and reopened: it is corrected, never cleared (S-40). */
  'was-decided',
  /** A final score, a box score or a forfeit entered by hand: it was never on the tracker. */
  'entered-by-hand',
  'game-postponed',
  'game-cancelled',
  /** Live, but with no plays from the tracker. */
  'not-tracked',
  /**
   * Another account's scoring session is on the game, its lease run out or not: that
   * device may be scoring with no signal. Taking it over, which asks, is the way through.
   */
  'session-held',
  /** A basket, foul or turnover stands: a reason is needed. */
  'reason-needed',
] as const;
export type NotStartedRefusal = (typeof notStartedRefusals)[number];

export const NotStartedReply = z.discriminatedUnion('status', [
  /** Done: the game is scheduled again; `sequence` is the marker's, the state's from now on. */
  z.strictObject({ status: z.literal('not-started'), sequence: Ms, sentAt: Ms }),
  z.strictObject({ status: z.literal('refused'), code: z.enum(notStartedRefusals), sentAt: Ms }),
]);
export type NotStartedReply = z.infer<typeof NotStartedReply>;

/** The status each answer is sent with. */
export function notStartedStatus(reply: NotStartedReply): number {
  if (reply.status === 'not-started') return 200;
  if (reply.code === 'not-allowed') return 403;
  if (reply.code === 'unknown-game') return 404;
  return 409;
}

/** The reply `body` is when it is our server's own at its own `status`; null for anything else. */
export const ownNotStartedReply = (status: number, body: unknown): NotStartedReply | null => {
  const read = NotStartedReply.safeParse(body);
  return read.success && notStartedStatus(read.data) === status ? read.data : null;
};
