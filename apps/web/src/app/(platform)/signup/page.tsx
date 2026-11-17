import {
  BotCheckField,
  EmailField,
  NextField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../features/sign-in/index.ts';
import { t } from '../../../server/messages.ts';
import { googleAction, signUpAction } from '../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../server/sign-in/device.ts';
import { botCheckOnPage } from '../../../server/sign-in/next-visit.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';

// A new account (R-2, T-67): the email first, then a code, then a password.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  const botCheck = await botCheckOnPage();
  return (
    <SignInScreen title="signUp.title" intro={t('signUp.intro')} search={search}>
      <form action={signUpAction}>
        <NextField next={next} />
        <EmailField />
        <BotCheckField {...botCheck} action="sign-up" />
        <SubmitButton words="signUp.sendCode" />
      </form>
      <p>{t('signIn.or')}</p>
      <form action={googleAction}>
        <NextField next={next} />
        <SubmitButton words="signIn.google" />
      </form>
      <p>
        <a href={screenUrl('signin', { next })}>{t('signIn.haveAccount')}</a>
      </p>
    </SignInScreen>
  );
}
