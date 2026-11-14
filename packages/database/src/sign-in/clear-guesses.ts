// A new password: the address's wrong guesses are forgotten (T-85).
import type { SignInScope } from '../db/sign-in-transaction.ts';
import { clearSubject } from './guess-counts.ts';
import { lockSubject } from './subject-lock.ts';

export async function clearGuesses(scope: SignInScope, email: string): Promise<void> {
  await lockSubject(scope, 'guess', 'email', email);
  await clearSubject(scope, 'email', email);
}
