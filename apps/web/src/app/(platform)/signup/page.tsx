import {
  AlreadySignedIn,
  EmailField,
  NextField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../features/sign-in/index.ts';
import { t } from '../../../server/messages.ts';
import { googleAction, signUpAction } from '../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../server/sign-in/device.ts';
import { googleSetUp } from '../../../server/sign-in/next-visit.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';
import { flowOfThisRequest } from '../../../server/sign-in/this-screen.ts';
import { signedInPerson } from '../../../server/signed-in-leagues.ts';

// A new account (R-2, T-67): the email first, then a code, then a password. Since step
// 2.163: a signed-in person is told they are (L10); the code screen's "Change it" comes
// back here with the address it named filled in, to be corrected (M24); "Continue with
// Google" only where Google is set up (M27).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  const person = await signedInPerson();
  if (person.kind === 'signed-in') return <AlreadySignedIn email={person.email} next={next} />;
  const flow = await flowOfThisRequest();
  return (
    <SignInScreen title="signUp.title" intro={t('signUp.intro')} search={search}>
      <form action={signUpAction}>
        <NextField next={next} />
        <EmailField value={flow?.purpose === 'sign-up' ? flow.email : undefined} />
        <SubmitButton words="signUp.sendCode" />
      </form>
      {googleSetUp() ? (
        <>
          <p>{t('signIn.or')}</p>
          <form action={googleAction}>
            <NextField next={next} />
            <SubmitButton words="signIn.google" />
          </form>
        </>
      ) : null}
      <p>
        <a href={screenUrl('signin', { next })}>{t('signIn.haveAccount')}</a>
      </p>
    </SignInScreen>
  );
}
