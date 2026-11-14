// The try was right: the network's count for it is taken back and the address's
// wrong guesses are forgotten (record 013).
import type { SignInScope } from '../db/sign-in-transaction.ts';
import { normalizedUuid } from '../db/uuid.ts';
import { clearSubject, ticketEmail, uncountGuess } from './guess-counts.ts';
import { lockSubject } from './subject-lock.ts';

export async function forgiveGuess(scope: SignInScope, ticket: string): Promise<void> {
  // Tickets are made by reserveGuess; anything else names no guess.
  if (normalizedUuid(ticket) !== ticket) return;
  const email = await ticketEmail(scope, ticket);
  if (email !== undefined) await lockSubject(scope, 'guess', 'email', email);
  await uncountGuess(scope, ticket, 'network');
  if (email !== undefined) await clearSubject(scope, 'email', email);
}
