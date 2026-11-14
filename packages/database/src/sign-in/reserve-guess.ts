// One try at a password or a code (T-85, T-225): checks the network's limit and the
// address's (unless null). If both allow it, counts it as wrong on each now, before
// anything is checked, and returns a ticket that takes it back (record 013).
import { randomUUID } from 'node:crypto';
import type { SignInScope } from '../db/sign-in-transaction.ts';
import { countGuess, guessWait } from './guess-counts.ts';
import type { AttemptLimits, Limited } from './sign-in-store-types.ts';
import { lockSubject } from './subject-lock.ts';

export type GuessRequest = {
  readonly email: string | null;
  readonly network: string;
  readonly perEmail: AttemptLimits;
  readonly perNetwork: AttemptLimits;
};

export async function reserveGuess(
  scope: SignInScope,
  request: GuessRequest,
  at: Date,
): Promise<Limited | { readonly ticket: string }> {
  const { email, network } = request;
  await lockSubject(scope, 'guess', 'network', network);
  if (email !== null) await lockSubject(scope, 'guess', 'email', email);
  const waits = [await guessWait(scope, 'network', network, request.perNetwork, at)];
  if (email !== null) waits.push(await guessWait(scope, 'email', email, request.perEmail, at));
  const found = waits.filter((wait) => wait !== null);
  if (found.length) return { retryAfterSeconds: Math.max(...found) };
  const ticket = randomUUID();
  await countGuess(scope, ticket, 'network', network, request.perNetwork, at);
  if (email !== null) await countGuess(scope, ticket, 'email', email, request.perEmail, at);
  return { ticket };
}
