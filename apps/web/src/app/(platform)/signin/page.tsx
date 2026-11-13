import { platformUrl } from '@srleagues/core';
import {
  EmailField,
  NextField,
  PasswordField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../features/sign-in/index.ts';
import { t } from '../../../server/messages.ts';
import { googleAction, signInAction } from '../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../server/sign-in/device.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';

// Email and password, or Google (R-2, T-67). The same screen whether or not the
// address has an account (T-68).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  return (
    <SignInScreen title="page.signIn" search={search}>
      <form action={signInAction}>
        <NextField next={next} />
        <EmailField />
        <PasswordField />
        <SubmitButton words="signIn.submit" />
      </form>
      <p>
        <a href={platformUrl('forgotPassword')}>{t('signIn.forgot')}</a>
      </p>
      <p>{t('signIn.or')}</p>
      <form action={googleAction}>
        <NextField next={next} />
        <SubmitButton words="signIn.google" />
      </form>
      <p>
        <a href={screenUrl('signup', { next })}>{t('signIn.createAccount')}</a>
      </p>
    </SignInScreen>
  );
}
