import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import {
  NextField,
  PasswordField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { confirmPasswordAction, googleAction } from '../../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../../server/sign-in/device.ts';
import { googleSetUp } from '../../../../server/sign-in/next-visit.ts';
import { screenUrl } from '../../../../server/sign-in/problems.ts';
import { signedInPerson } from '../../../../server/signed-in-leagues.ts';

// The password again before a sensitive action (T-70). An account made with Google
// proves itself with a fresh Google sign-in instead, where Google is set up (step 2.163,
// M27). A signed-out person has no password to give again: they are sent to sign in,
// and brought back here, to the same action (L10).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  const person = await signedInPerson();
  if (person.kind === 'account-problem') redirect(platformUrl('account'));
  if (person.kind === 'visitor') {
    redirect(screenUrl('signin', { next: screenUrl('confirmPassword', { next }) }));
  }
  return (
    <SignInScreen title="confirm.title" intro={t('confirm.intro')} search={search}>
      <form action={confirmPasswordAction}>
        <NextField next={next} />
        <PasswordField />
        <SubmitButton words="confirm.submit" />
      </form>
      {googleSetUp() ? (
        <form action={googleAction}>
          <NextField next={next} />
          <SubmitButton words="confirm.google" />
        </form>
      ) : null}
    </SignInScreen>
  );
}
