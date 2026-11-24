// One scorer at a time (T6 §5, S-5, T-116; record 036). Opening a game to score takes
// a scoring session: a lease held by one account on one device, renewed by the
// tracker while it is open and running out about two minutes after the last renewal.
//
// - A game with no session is free: whoever opens it next takes it. A game not yet
//   under way (not live) whose session's lease has run out is free too, and the lapsed
//   session is ended. A game under way (live, a reopened one included) is never given
//   away by a lapse (S-42, T-336): whoever else opens it is told who holds it and when
//   that device was last heard from, and takes it only by taking over.
// - A session whose lease ran out but which nobody has taken still belongs to its
//   device: renewing or reopening it on that device carries on with the same session,
//   so taps it queued while offline are still its own (record 036).
// - Taking over ends the holder's session and starts a new one in the same
//   transaction, so the displaced device's session id matches nothing from then on.
// - Two devices opening at the same moment: the database keeps one session per game
//   and `start` reports, without throwing, that another was first; that device is
//   told who holds the game.
//
// Times are the server's clock (the transaction's `clock`), never the device's.
import { sessionLeaseSeconds } from '@srleagues/contracts';
import { z } from 'zod';
import { fail, ok, type CommandContext, type Result } from '../../command/index.ts';
import { isClosed } from './game-fields.ts';
import type { ScoringSession, ScoringTx } from './ports.ts';

/** How long a lease lasts after it is taken or renewed. */
export const leaseMs = sessionLeaseSeconds * 1000;

/** A game's or session's id, in lower case as the database spells it, so comparisons hold. */
export const lowerId = z.uuid().transform((id) => id.toLowerCase());

/** The tracker's own id for its device: what the database accepts (1 to 200 characters). */
export const deviceIdField = z.string().trim().min(1).max(200);

/** Who holds a game, as another scorekeeper is shown it: the page turns the account into a name. */
export type ScoringHolder = {
  readonly accountId: string;
  /** When the holder's session began: what a takeover must name (T-116). */
  readonly since: number;
  /**
   * When the holder's device was last heard from, by the server's clock (S-42, T-336):
   * the last time its lease was written, so up to about half a minute early.
   */
  readonly lastHeardAt: number;
  /** The holder is the asking account itself, on another device: told here, never by names. */
  readonly sameAccount: boolean;
};

/** Every answer about a session carries `sentAt`, the server's time, so the tracker can allow for its own clock. */
export type ScoringSessionReply =
  | {
      readonly status: 'held-by-you';
      readonly sessionId: string;
      readonly expiresAt: number;
      readonly sentAt: number;
    }
  | { readonly status: 'held-by-other'; readonly holder: ScoringHolder; readonly sentAt: number }
  | {
      readonly status: 'ended';
      /** taken-over: another session holds the game now; released: none does. */
      readonly reason: 'taken-over' | 'released';
      readonly sentAt: number;
    };

/** One account on one device. */
export type ScoringDevice = { readonly accountId: string; readonly deviceId: string };

export type ScorableGameError = {
  readonly code: 'game-not-found' | 'game-closed' | 'game-postponed';
};

/** The signed-in account; the commands' policy has already refused anyone else. */
export function scorerOf(context: CommandContext): string {
  if (context.accountId === null) throw new Error('A scoring session needs a signed-in account.');
  return context.accountId;
}

/**
 * A game that can be opened to score: there, not in the bin, not decided or cancelled,
 * and not postponed. A postponed game has no date to be played on; the tracker's
 * commands refuse it too (game-not-live), so it cannot be opened only to have every
 * tap refused. Once it is given a new slot it is scheduled again and opens.
 */
export async function scorableGame(
  tx: ScoringTx,
  gameId: string,
): Promise<Result<ScorableGame, ScorableGameError>> {
  const game = await tx.games.find(gameId);
  if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
  if (isClosed(game.status)) return fail({ code: 'game-closed' });
  if (game.status === 'postponed') return fail({ code: 'game-postponed' });
  return ok({ id: game.id, underWay: game.status === 'live' });
}

/**
 * A game that can be opened, and whether it is under way (T-336): live on the server,
 * which a reopened game is again. One not yet started is opened without a question.
 */
export type ScorableGame = { readonly id: string; readonly underWay: boolean };

export const isOwnSession = (session: ScoringSession, device: ScoringDevice) =>
  session.accountId === device.accountId && session.deviceId === device.deviceId;

export const hasLapsed = (session: ScoringSession, now: number) => session.heldUntil <= now;

/**
 * Who holds the game, as `askedBy` (the account opening it) is told (S-42): when the
 * holder's device was last heard from, its lease's last writing (never before the
 * session began), and whether it is `askedBy` itself on another device.
 */
export const heldByOther = (
  session: ScoringSession,
  now: number,
  askedBy: string,
): ScoringSessionReply => ({
  status: 'held-by-other',
  holder: {
    accountId: session.accountId,
    since: session.since,
    lastHeardAt: Math.max(session.since, session.heldUntil - leaseMs),
    sameAccount: session.accountId === askedBy,
  },
  sentAt: now,
});

/**
 * The least time the hold has to spare before another device may open the game without
 * the takeover question (T-295, the code review's M2): never less than before T-295,
 * when the lease was written again every half minute, so a phone locked for a minute or
 * a minute with no signal does not let the game go.
 */
export const holdSpareMs = 90_000;

/** How often the tracker asks whether it still holds the game (`holdCheckMs`, T-295). */
const trackerCheckMs = 5_000;

/**
 * The lease is written again only once less than the spare time and one check of the
 * tracker's are left (T-295): the tracker asks every few seconds whether it still holds
 * the game, so that a takeover is learnt at once, and most answers are a read. With
 * the lease at two minutes that is a write about every half minute, as before.
 */
export const renewWhenLeftMs = Math.min(leaseMs, holdSpareMs + trackerCheckMs);

/**
 * Renews a session its own device is still holding: while more than `renewWhenLeftMs` is
 * left nothing is written and the lease stands; otherwise it runs again from now, in one
 * write that matches only this session. If it was ended a moment ago by another
 * request, says who holds the game instead.
 */
export async function keepSession(
  tx: ScoringTx,
  session: ScoringSession,
  now: number,
): Promise<ScoringSessionReply> {
  const held = (expiresAt: number): ScoringSessionReply => ({
    status: 'held-by-you',
    sessionId: session.id,
    expiresAt,
    sentAt: now,
  });
  const dueBefore = now + renewWhenLeftMs;
  if (session.heldUntil >= dueBefore) return held(session.heldUntil);
  const heldUntil = now + leaseMs;
  if (await tx.scoringSessions.extend(session.gameId, session.id, heldUntil, dueBefore)) {
    return held(heldUntil);
  }
  const current = await tx.scoringSessions.findForGame(session.gameId);
  // Still this session, renewed by another request a moment ago: it stands.
  if (current?.id === session.id) return held(current.heldUntil);
  return current === undefined
    ? { status: 'ended', reason: 'released', sentAt: now }
    : heldByOther(current, now, session.accountId);
}

/**
 * Starts a session for the device on a game that had none a moment ago. If another
 * request started one first, the device is told who holds it.
 */
export async function claimGame(
  tx: ScoringTx,
  gameId: string,
  device: ScoringDevice,
  now: number,
): Promise<ScoringSessionReply> {
  const started = await tx.scoringSessions.start({
    gameId,
    accountId: device.accountId,
    deviceId: device.deviceId,
    since: now,
    heldUntil: now + leaseMs,
  });
  if (started !== undefined) {
    return {
      status: 'held-by-you',
      sessionId: started.id,
      expiresAt: started.heldUntil,
      sentAt: now,
    };
  }
  return answerFromHolder(tx, gameId, now, device.accountId);
}

/** Who holds the game now, after a write found the session changed under it. */
async function answerFromHolder(
  tx: ScoringTx,
  gameId: string,
  now: number,
  askedBy: string,
): Promise<ScoringSessionReply> {
  const holder = await tx.scoringSessions.findForGame(gameId);
  return holder === undefined
    ? { status: 'ended', reason: 'released', sentAt: now }
    : heldByOther(holder, now, askedBy);
}

/**
 * Opens the game for the device: carries on with its own session, takes the game if
 * it is free (no session, or one whose lease has run out on a game not under way), or
 * says who holds it. A game under way is never given away by a lapse (S-42, T-336):
 * the holder is named, with when their device was last heard from, and only a
 * takeover takes it.
 */
export async function openFor(
  tx: ScoringTx,
  game: ScorableGame,
  device: ScoringDevice,
  now: number,
): Promise<ScoringSessionReply> {
  const gameId = game.id;
  const current = await tx.scoringSessions.findForGame(gameId);
  if (current === undefined) return claimGame(tx, gameId, device, now);
  if (isOwnSession(current, device)) return keepSession(tx, current, now);
  if (game.underWay || !hasLapsed(current, now)) {
    return heldByOther(current, now, device.accountId);
  }
  // Lapsed: end it only if it is still lapsed, so a renewal that just landed wins.
  await tx.scoringSessions.end(gameId, current.id, now);
  return claimGame(tx, gameId, device, now);
}

/**
 * Where a session stands for the account sending it (T6 §5): held while it is the
 * game's session and the account's own, whether or not its lease has run out, since
 * nobody has taken the game; otherwise ended, because another session holds the game
 * or none does. Renewing and releasing use it; the tracker's commands (step 2.29)
 * refuse a batch whose session is not held.
 */
export async function sessionStanding(
  tx: ScoringTx,
  gameId: string,
  sessionId: string,
  accountId: string,
): Promise<
  | { readonly held: true; readonly session: ScoringSession }
  | { readonly held: false; readonly reason: 'taken-over' | 'released' }
> {
  const current = await tx.scoringSessions.findForGame(gameId);
  if (current === undefined) return { held: false, reason: 'released' };
  if (current.id !== sessionId || current.accountId !== accountId) {
    return { held: false, reason: 'taken-over' };
  }
  return { held: true, session: current };
}
