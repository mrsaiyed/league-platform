// One scorer at a time (T6 §5, S-5, T-116; record 036). Opening a game to score takes
// a scoring session: a lease held by one account on one device, renewed by the
// tracker while it is open and running out about two minutes after the last renewal.
//
// - A game with no session, or whose session's lease has run out, is free: whoever
//   opens it next takes it, and the lapsed session is ended.
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
): Promise<Result<string, ScorableGameError>> {
  const game = await tx.games.find(gameId);
  if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
  if (isClosed(game.status)) return fail({ code: 'game-closed' });
  if (game.status === 'postponed') return fail({ code: 'game-postponed' });
  return ok(game.id);
}

export const isOwnSession = (session: ScoringSession, device: ScoringDevice) =>
  session.accountId === device.accountId && session.deviceId === device.deviceId;

export const hasLapsed = (session: ScoringSession, now: number) => session.heldUntil <= now;

export const heldByOther = (session: ScoringSession, now: number): ScoringSessionReply => ({
  status: 'held-by-other',
  holder: { accountId: session.accountId, since: session.since },
  sentAt: now,
});

/**
 * Renews a session its own device is still holding: the lease runs again from now.
 * If it was ended a moment ago by another request, says who holds the game instead.
 */
export async function keepSession(
  tx: ScoringTx,
  session: ScoringSession,
  now: number,
): Promise<ScoringSessionReply> {
  const heldUntil = now + leaseMs;
  if (await tx.scoringSessions.extend(session.gameId, session.id, heldUntil)) {
    return { status: 'held-by-you', sessionId: session.id, expiresAt: heldUntil, sentAt: now };
  }
  return answerFromHolder(tx, session.gameId, now);
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
  return answerFromHolder(tx, gameId, now);
}

/** Who holds the game now, after a write found the session changed under it. */
async function answerFromHolder(
  tx: ScoringTx,
  gameId: string,
  now: number,
): Promise<ScoringSessionReply> {
  const holder = await tx.scoringSessions.findForGame(gameId);
  return holder === undefined
    ? { status: 'ended', reason: 'released', sentAt: now }
    : heldByOther(holder, now);
}

/**
 * Opens the game for the device: carries on with its own session, takes the game if
 * it is free (no session, or one whose lease has run out), or says who holds it.
 */
export async function openFor(
  tx: ScoringTx,
  gameId: string,
  device: ScoringDevice,
  now: number,
): Promise<ScoringSessionReply> {
  const current = await tx.scoringSessions.findForGame(gameId);
  if (current === undefined) return claimGame(tx, gameId, device, now);
  if (isOwnSession(current, device)) return keepSession(tx, current, now);
  if (!hasLapsed(current, now)) return heldByOther(current, now);
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
