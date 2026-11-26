// "Change your email" on the account page, its second half (T-73, step 2.128, T-457): the
// code from the new address. The sign-in service spends one attempt of this account's own
// pending change (wrong codes counted as every code's are, T-225); a right one moves the
// address there, signs out every other device and keeps this one. Then our own account's
// address follows (T-458) and the OLD address is told, once, that it was changed (S-129).
// Any refusal changes nothing and sends nothing. The code is never logged nor kept.
import { fail, ok, type Result } from '@srleagues/core';
import type { SignInService } from '@srleagues/providers';
import type { WebPorts } from '../ports.ts';
import type { SignInMail } from './sign-in-mail.ts';
import type { OwnEmailContext } from './start-own-email-change.ts';

export type ConfirmOwnEmailChangeDeps = {
  readonly signIn: Pick<SignInService, 'confirmEmailChange'>;
  readonly ownEmail: Pick<WebPorts['ownEmail'], 'change'>;
  readonly mail: Pick<SignInMail, 'emailChanged'>;
  readonly now: () => Date;
  /** Told, with no address (T-86), when our records give the new address to another account. */
  readonly warn: (message: string) => void;
};

export type ConfirmOwnEmailChangeError =
  | { readonly code: 'code-wrong' | 'code-expired' }
  | { readonly code: 'too-many-attempts'; readonly retryAfterSeconds: number }
  | { readonly code: 'signed-out' };

export async function confirmOwnEmailChange(
  context: OwnEmailContext,
  input: { readonly code: string },
  deps: ConfirmOwnEmailChangeDeps,
): Promise<
  Result<{ readonly newEmail: string; readonly endedSessions: number }, ConfirmOwnEmailChangeError>
> {
  const { accountId } = context;
  if (context.accessToken === '' || accountId === undefined) return fail({ code: 'signed-out' });
  const changed = await deps.signIn.confirmEmailChange({
    accessToken: context.accessToken,
    code: input.code,
    networkAddress: context.networkAddress,
  });
  if (!changed.ok) {
    const error = changed.error;
    switch (error.code) {
      case 'code-wrong':
      case 'code-expired':
        return fail({ code: error.code });
      case 'too-many-attempts':
        // A code used up is a wait of nothing: ask again for a new one.
        return fail({ code: error.code, retryAfterSeconds: error.retryAfterSeconds ?? 0 });
      case 'access-expired':
      case 'session-ended':
        return fail({ code: 'signed-out' });
    }
  }
  const { oldEmail, newEmail, endedSessions } = changed.value;
  // T-458: the service has moved it; ours follows. Taken here is put right by hand.
  if ((await deps.ownEmail.change(accountId, newEmail)) === 'taken') {
    deps.warn('A confirmed change of email met an address another account holds in our records.');
  }
  await deps.mail.emailChanged(oldEmail, newEmail, deps.now());
  return ok({ newEmail, endedSessions });
}
