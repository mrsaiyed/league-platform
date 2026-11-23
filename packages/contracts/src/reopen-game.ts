// The scorekeeper's reopen (step 2.120, S-36; record 060, T-263): what crosses between
// the tracker and `/api/v1/leagues/{leagueId}/games/{game}/reopen`.
//
// - GET answers a `ReopenOffer` (200): whether Reopen is offered to this account now
//   (always, until a server time, or not, with the reason), and who ended the game. The
//   tracker asks before it shows the button, so no one types a reason and is then told
//   it is too late.
// - POST takes a `ReopenRequest` and answers a `ReopenReply`: `reopened` (200), or
//   `refused` with its code at the code's own status (`reopenRefusalStatus`).
// - Either may also answer the server's own `TrackerRefusal` (tracker-protocol.ts): 401
//   signed out, 400 a body it does not take, and, for GET, 403 not allowed and 404 no
//   such game.
//
// The tracker takes an answer as the server's word only when it is one of these bodies
// at its own status (`ownReopenReply`, `ownReopenOffer`, `ownTrackerRefusal`). Anything
// else (a gym Wi-Fi sign-in page, a filter's 403) is no answer, and is asked again.
import { z } from 'zod';

const Id = z.uuid();
const Ms = z.number().int().nonnegative();

/** The longest reason the server keeps (S-7, as for an admin's reopen). */
export const reopenReasonMaxLength = 1000;

/**
 * What the tracker posts. `requestId` is made once for the reopen and sent again with
 * every retry: a request the server already took is answered `reopened` again, so an
 * answer lost on the way never comes back as "this game is not over". `sequence`, when
 * the device has one, is the number of the last tap it knows of; a game that moved on
 * since is refused. A device that never scored the game leaves it out.
 */
export const ReopenRequest = z.strictObject({
  requestId: Id,
  reason: z.string().trim().min(1).max(reopenReasonMaxLength),
  sequence: z.number().int().min(1).optional(),
});
export type ReopenRequest = z.infer<typeof ReopenRequest>;

/** Why Reopen is not offered to this account now. */
export const reopenNotOfferedCodes = [
  /** The game is not over. */
  'game-not-decided',
  /** Its result was entered by hand, or it was decided while its tracker was live. */
  'not-ended-by-tracker',
  /** The league lets no scorekeeper reopen a game (its setting is 0). */
  'scorekeepers-may-not-reopen',
  /** Another account ended it; `endedBy` names them. */
  'not-ended-by-you',
  /** Longer ago than the league allows. */
  'reopen-time-over',
  /** It could be reopened, but an overturn rules on its result (S-85). */
  'result-overturned',
] as const;
export const ReopenNotOffered = z.enum(reopenNotOfferedCodes);
export type ReopenNotOffered = z.infer<typeof ReopenNotOffered>;

/** Every refusal a reopen is answered with. */
export const reopenRefusalCodes = [
  ...reopenNotOfferedCodes,
  /** The person may not score this game. */
  'not-allowed',
  /** No such game in this league (one of another league asked for through its address included). */
  'game-not-found',
  /**
   * The game moved on since the `sequence` the device sent, the request id was another's,
   * or a retry arrived after the game was decided again: the device reads the game again.
   */
  'changed-since-read',
  /** No reason, or one longer than `reopenReasonMaxLength`. */
  'reason-needed',
] as const;
export const ReopenRefusalCode = z.enum(reopenRefusalCodes);
export type ReopenRefusalCode = z.infer<typeof ReopenRefusalCode>;

/** The status each refusal is answered with. */
export const reopenRefusalStatus: Readonly<Record<ReopenRefusalCode, number>> = {
  'game-not-decided': 409,
  'not-ended-by-tracker': 409,
  'scorekeepers-may-not-reopen': 403,
  'not-ended-by-you': 403,
  'reopen-time-over': 403,
  'result-overturned': 409,
  'not-allowed': 403,
  'game-not-found': 404,
  'changed-since-read': 409,
  'reason-needed': 400,
};

/** Who ended the game, as staff are shown another account; null when no account is known. */
const EndedBy = z.strictObject({ displayName: z.string().max(120) }).nullable();

export const ReopenReply = z.discriminatedUnion('status', [
  /**
   * The game is live again (200). `sequence` is the number of the game's last saved
   * tap now: the reopen itself, or later taps when a retry finds it already reopened.
   * The device opens the game again through the session endpoint and carries on.
   */
  z.strictObject({ status: z.literal('reopened'), sequence: Ms, sentAt: Ms }),
  z.strictObject({
    status: z.literal('refused'),
    code: ReopenRefusalCode,
    endedBy: EndedBy,
    sentAt: Ms,
  }),
]);
export type ReopenReply = z.infer<typeof ReopenReply>;

/** The reply `body` is when it is our server's own, at its own `status`; null for anything else. */
export const ownReopenReply = (status: number, body: unknown): ReopenReply | null => {
  const read = ReopenReply.safeParse(body);
  if (!read.success) return null;
  const expected = read.data.status === 'reopened' ? 200 : reopenRefusalStatus[read.data.code];
  return expected === status ? read.data : null;
};

/** Whether, and until when, this account may reopen the game now. */
export const ReopenWhen = z.discriminatedUnion('when', [
  /** It may correct games: at any time. */
  z.strictObject({ when: z.literal('always') }),
  /** It ended the game: until this server time (ms). */
  z.strictObject({ when: z.literal('until'), until: Ms }),
  z.strictObject({ when: z.literal('no'), code: ReopenNotOffered }),
]);
export type ReopenWhen = z.infer<typeof ReopenWhen>;

/** What GET answers (200). */
export const ReopenOffer = z.strictObject({
  reopen: ReopenWhen,
  endedBy: EndedBy,
  sentAt: Ms,
});
export type ReopenOffer = z.infer<typeof ReopenOffer>;

/** The offer `body` is when it is our server's own, at 200; null for anything else. */
export const ownReopenOffer = (status: number, body: unknown): ReopenOffer | null => {
  if (status !== 200) return null;
  const read = ReopenOffer.safeParse(body);
  return read.success ? read.data : null;
};
