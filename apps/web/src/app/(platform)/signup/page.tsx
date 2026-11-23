import { legalNoteHref } from '../../../features/shell/index.ts';
import {
  AlreadySignedIn,
  BotCheckField,
  EmailField,
  NextField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../features/sign-in/index.ts';
import { webPorts } from '../../../server/container.ts';
import { t } from '../../../server/messages.ts';
import { googleAction, signUpAction } from '../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../server/sign-in/device.ts';
import { botCheckOnPage, googleSetUp } from '../../../server/sign-in/next-visit.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';
import { flowOfThisRequest } from '../../../server/sign-in/this-screen.ts';
import { signedInPerson } from '../../../server/signed-in-leagues.ts';

// A new account (R-2, T-67): the email first, then a code, then a password. It links the
// Terms and Privacy notes (step 2.135; the using-it audit, M22), which lead back to the
// league the person came from. Since step 2.163: a signed-in person is told they are (L10);
// the code screen's "Change it" comes back here with the address it named filled in, to be
// corrected (M24); "Continue with Google" only where Google is set up (M27), and not on the
// test copy (step 2.205): an account made with Google holds a real address.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  const person = await signedInPerson();
  if (person.kind === 'signed-in') return <AlreadySignedIn email={person.email} next={next} />;
  const flow = await flowOfThisRequest();
  const google = googleSetUp() && !(await webPorts()).testCopy;
  const botCheck = await botCheckOnPage();
  return (
    <SignInScreen title="signUp.title" intro={t('signUp.intro')} search={search}>
      <form action={signUpAction}>
        <NextField next={next} />
        <EmailField value={flow?.purpose === 'sign-up' ? flow.email : undefined} />
        <BotCheckField {...botCheck} action="sign-up" />
        <SubmitButton words="signUp.sendCode" />
      </form>
      {google ? (
        <>
          <p>{t('signIn.or')}</p>
          <form action={googleAction}>
            <NextField next={next} />
            <SubmitButton words="signIn.google" />
          </form>
        </>
      ) : null}
      <p>
        <a className="ui-button" data-kind="quiet" href={screenUrl('signin', { next })}>
          {t('signIn.haveAccount')}
        </a>
      </p>
      <p>
        <a className="ui-button" data-kind="quiet" href={legalNoteHref('terms', next)}>
          {t('legal.readTerms')}
        </a>
      </p>
      <p>
        <a className="ui-button" data-kind="quiet" href={legalNoteHref('privacy', next)}>
          {t('legal.readPrivacy')}
        </a>
      </p>
    </SignInScreen>
  );
}
