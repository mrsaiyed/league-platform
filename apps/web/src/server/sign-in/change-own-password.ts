// "Change your password" on the account page (T-85, T4 line 47, step 2.128). The account is
// the session's (`context`, from the cookie, never from the form). The sign-in service does
// the change (changePassword: the old one counted as a wrong sign-in is, the new one by the
// sign-up rule, every other device signed out, this one kept); this then emails the account,
// at the address the service holds for it, through our own email service. A refusal
// changes nothing, sends nothing, and says which box was wrong. Nothing here ever holds a
// password longer than the call, nor writes one anywhere.
import { fail, ok, type Result } from '@srleagues/core';
import type { SignInService } from '@srleagues/providers';
import type { SignInMail } from './sign-in-mail.ts';

export type ChangeOwnPasswordContext = {
  readonly accessToken: string;
  readonly networkAddress: string;
};

export type ChangeOwnPasswordInput = {
  readonly oldPassword: string;
  readonly newPassword: string;
};

export type ChangeOwnPasswordDeps = {
  readonly signIn: Pick<SignInService, 'changePassword' | 'identify'>;
  readonly mail: Pick<SignInMail, 'passwordChanged'>;
  readonly now: () => Date;
};

/** The box a refusal is about; null when it is about neither (a wait, a signed-out device). */
export type PasswordBox = 'oldPassword' | 'newPassword';

export type ChangeOwnPasswordError =
  | { readonly code: 'wrong-password'; readonly box: 'oldPassword' }
  | { readonly code: 'no-password'; readonly box: 'oldPassword' }
  | {
      readonly code: 'password-too-short' | 'password-too-long' | 'password-leaked';
      readonly box: 'newPassword';
    }
  | { readonly code: 'too-many-attempts'; readonly box: null; readonly retryAfterSeconds: number }
  | { readonly code: 'signed-out'; readonly box: null };

export async function changeOwnPassword(
  context: ChangeOwnPasswordContext,
  input: ChangeOwnPasswordInput,
  deps: ChangeOwnPasswordDeps,
): Promise<Result<{ readonly endedSessions: number }, ChangeOwnPasswordError>> {
  if (context.accessToken === '') return fail({ code: 'signed-out', box: null });
  const changed = await deps.signIn.changePassword({
    accessToken: context.accessToken,
    oldPassword: input.oldPassword,
    newPassword: input.newPassword,
    networkAddress: context.networkAddress,
  });
  if (!changed.ok) {
    const error = changed.error;
    switch (error.code) {
      case 'wrong-password':
      case 'no-password':
        return fail({ code: error.code, box: 'oldPassword' });
      case 'password-too-short':
      case 'password-too-long':
      case 'password-leaked':
        return fail({ code: error.code, box: 'newPassword' });
      case 'too-many-attempts':
        return fail({ code: error.code, box: null, retryAfterSeconds: error.retryAfterSeconds });
      case 'access-expired':
      case 'session-ended':
        return fail({ code: 'signed-out', box: null });
    }
  }
  // The account hears of it (T-85), at the address the service holds for it.
  const who = await deps.signIn.identify({ accessToken: context.accessToken });
  if (who.ok) await deps.mail.passwordChanged(who.value.email, deps.now());
  return ok({ endedSessions: changed.value.endedSessions });
}
