// Wrong guesses per address or network (T-85, T-225), the same rules as the attempt
// limiter the in-memory store uses (packages/providers/src/sign-in/local/
// attempt-limiter.ts): guesses older than the window are forgotten; from `slowAfter`
// in the window each try waits `slowSeconds` after the last; at `lockAfter` the
// subject is locked for `lockMinutes`, by the guess that reached it, and taking that
// guess back lifts the lock. Unlike the limiter, the counts are not kept apart by
// the numbers: the adapter uses one set of numbers per scope (record 052).
//
// Shared by the guess methods, each its own file; callers hold the subject's lock.
import { randomUUID } from 'node:crypto';
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { AttemptLimits } from './sign-in-store-types.ts';

const minute = 60_000;
export type GuessScope = 'email' | 'network';

const waitUntil = (until: Date, at: Date) =>
  Math.max(1, Math.ceil((until.getTime() - at.getTime()) / 1000));

/** Seconds to wait before the subject may try again, or null if it may now. */
export async function guessWait(
  scope: SignInScope,
  guessScope: GuessScope,
  subject: string,
  limits: AttemptLimits,
  at: Date,
): Promise<number | null> {
  const trx = signInTransactionOf(scope);
  const lock = await trx
    .selectFrom('sign_in.guess_locks')
    .select('locked_until')
    .where('scope', '=', guessScope)
    .where('subject', '=', subject)
    .executeTakeFirst();
  if (lock !== undefined) {
    if (at.getTime() < lock.locked_until.getTime()) return waitUntil(lock.locked_until, at);
    // The lock has run out: it and the guesses behind it are forgotten.
    await clearSubject(scope, guessScope, subject);
  }
  const recent = await recentGuesses(scope, guessScope, subject, limits, at);
  const last = recent[recent.length - 1];
  if (last !== undefined && recent.length >= limits.slowAfter) {
    const until = new Date(last.getTime() + limits.slowSeconds * 1000);
    if (at.getTime() < until.getTime()) return waitUntil(until, at);
  }
  return null;
}

/** The times of the subject's guesses in the window before `at`, oldest first; older ones are removed. */
async function recentGuesses(
  scope: SignInScope,
  guessScope: GuessScope,
  subject: string,
  limits: AttemptLimits,
  at: Date,
): Promise<Date[]> {
  const trx = signInTransactionOf(scope);
  const windowStart = new Date(at.getTime() - limits.windowMinutes * minute);
  await trx
    .deleteFrom('sign_in.guesses')
    .where('scope', '=', guessScope)
    .where('subject', '=', subject)
    .where('counted_at', '<=', windowStart)
    .execute();
  const rows = await trx
    .selectFrom('sign_in.guesses')
    .select('counted_at')
    .where('scope', '=', guessScope)
    .where('subject', '=', subject)
    .orderBy('counted_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => row.counted_at);
}

/** Counts a wrong guess now, under `ticket`, and locks the subject if it reached the limit. */
export async function countGuess(
  scope: SignInScope,
  ticket: string,
  guessScope: GuessScope,
  subject: string,
  limits: AttemptLimits,
  at: Date,
): Promise<void> {
  const trx = signInTransactionOf(scope);
  const id = randomUUID();
  await trx
    .insertInto('sign_in.guesses')
    .values({ id, ticket, scope: guessScope, subject, counted_at: at })
    .execute();
  const recent = await recentGuesses(scope, guessScope, subject, limits, at);
  if (recent.length < limits.lockAfter) return;
  const lockedUntil = new Date(at.getTime() + limits.lockMinutes * minute);
  await trx
    .insertInto('sign_in.guess_locks')
    .values({ scope: guessScope, subject, locked_until: lockedUntil, by_guess_id: id })
    .onConflict((conflict) =>
      conflict
        .columns(['scope', 'subject'])
        .doUpdateSet({ locked_until: lockedUntil, by_guess_id: id }),
    )
    .execute();
}

/** Takes back the guess counted under `ticket` in one scope, and the lock it set, if any. */
export async function uncountGuess(
  scope: SignInScope,
  ticket: string,
  guessScope: GuessScope,
): Promise<void> {
  const trx = signInTransactionOf(scope);
  const removed = await trx
    .deleteFrom('sign_in.guesses')
    .where('ticket', '=', ticket)
    .where('scope', '=', guessScope)
    .returning('id')
    .execute();
  if (removed.length === 0) return;
  await trx
    .deleteFrom('sign_in.guess_locks')
    .where(
      'by_guess_id',
      'in',
      removed.map((row) => row.id),
    )
    .execute();
}

/** Forgets every guess and the lock of one subject. */
export async function clearSubject(
  scope: SignInScope,
  guessScope: GuessScope,
  subject: string,
): Promise<void> {
  const trx = signInTransactionOf(scope);
  await trx
    .deleteFrom('sign_in.guesses')
    .where('scope', '=', guessScope)
    .where('subject', '=', subject)
    .execute();
  await trx
    .deleteFrom('sign_in.guess_locks')
    .where('scope', '=', guessScope)
    .where('subject', '=', subject)
    .execute();
}

/** The address a ticket counted a guess against, if it did. */
export async function ticketEmail(scope: SignInScope, ticket: string): Promise<string | undefined> {
  const row = await signInTransactionOf(scope)
    .selectFrom('sign_in.guesses')
    .select('subject')
    .where('ticket', '=', ticket)
    .where('scope', '=', 'email')
    .executeTakeFirst();
  return row?.subject;
}
