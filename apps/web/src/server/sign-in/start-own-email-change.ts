// "Change your email" on the account page, its first half (T-73, step 2.128, T-457). The
// account is the session's (`context`, from the cookie, never from the form). Our own
// records are asked whether another account holds the address (a yes or a no, T-458); then
// the sign-in service checks the password (counted as a wrong sign-in is) and sends a code
// to the NEW address, or no code when the address is taken, with the same answer either
// way (T-68). Nothing changes yet. On its yes the OLD address is told, once, that a change
// was asked (S-129). A refusal sends nothing. Nothing here holds a password or a code
// longer than the call, nor writes one anywhere.
import { signInEmail } from '@srleagues/contracts';
import { fail, ok, type Result } from '@srleagues/core';
import type { SignInService } from '@srleagues/providers';
import type { WebPorts } from '../ports.ts';
import type { SignInMail } from './sign-in-mail.ts';

export type OwnEmailContext = {
  readonly accessToken: string;
  readonly networkAddress: string;
  /** Our account of the session; undefined when the session is none of ours. */
  readonly accountId: string | undefined;
};

export type StartOwnEmailChangeInput = {
  readonly newEmail: string;
  readonly password: string;
};

export type StartOwnEmailChangeDeps = {
  readonly signIn: Pick<SignInService, 'startEmailChange' | 'identify'>;
  readonly ownEmail: Pick<WebPorts['ownEmail'], 'isFree'>;
  readonly mail: Pick<SignInMail, 'emailChangeAsked'>;
  readonly now: () => Date;
};

export type StartOwnEmailChangeError =
  | { readonly code: 'wrong-password' | 'no-password'; readonly box: 'password' }
  | { readonly code: 'invalid-email' | 'same-email'; readonly box: 'newEmail' }
  | { readonly code: 'too-many-attempts'; readonly box: null; readonly retryAfterSeconds: number }
  | { readonly code: 'code-not-sent'; readonly box: null }
  | { readonly code: 'signed-out'; readonly box: null };

export async function startOwnEmailChange(
  context: OwnEmailContext,
  input: StartOwnEmailChangeInput,
  deps: StartOwnEmailChangeDeps,
): Promise<Result<{ readonly newEmail: string }, StartOwnEmailChangeError>> {
  const { accountId } = context;
  if (context.accessToken === '' || accountId === undefined) {
    return fail({ code: 'signed-out', box: null });
  }
  const who = await deps.signIn.identify({ accessToken: context.accessToken });
  if (!who.ok) return fail({ code: 'signed-out', box: null });
  const parsed = signInEmail.safeParse(input.newEmail);
  // An address that is not one is the service's to refuse; ours are asked only of one.
  const takenElsewhere = parsed.success && !(await deps.ownEmail.isFree(accountId, parsed.data));
  const started = await deps.signIn.startEmailChange({
    accessToken: context.accessToken,
    password: input.password,
    newEmail: input.newEmail,
    takenElsewhere,
    networkAddress: context.networkAddress,
  });
  if (!started.ok) {
    const error = started.error;
    switch (error.code) {
      case 'wrong-password':
      case 'no-password':
        return fail({ code: error.code, box: 'password' });
      case 'invalid-email':
      case 'same-email':
        return fail({ code: error.code, box: 'newEmail' });
      case 'too-many-attempts':
        return fail({ code: error.code, box: null, retryAfterSeconds: error.retryAfterSeconds });
      case 'code-not-sent':
        return fail({ code: error.code, box: null });
      case 'access-expired':
      case 'session-ended':
        return fail({ code: 'signed-out', box: null });
    }
  }
  if (!parsed.success) return fail({ code: 'invalid-email', box: 'newEmail' });
  // T-73: the old address hears of it, taken address or free, so nothing differs (T-68).
  await deps.mail.emailChangeAsked(who.value.email, parsed.data, deps.now());
  return ok({ newEmail: parsed.data });
}
