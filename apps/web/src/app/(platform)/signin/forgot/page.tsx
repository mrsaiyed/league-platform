import {
  EmailField,
  NextField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { forgotPasswordAction } from '../../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../../server/sign-in/device.ts';
import { screenUrl } from '../../../../server/sign-in/problems.ts';
import {
  flowOfThisRequest,
  typedEmailOfThisRequest,
} from '../../../../server/sign-in/this-screen.ts';

// The forgotten-password route (T-67): an emailed code, then a new password. It keeps
// the page to come back to (step 2.127), checked again by the flow (safeReturnPath), so
// after the new password the person is back where they started. Since step 2.163 it is
// titled "Choose a new password", has a way back to sign in (L10), and fills in the
// address this device last typed: the one a locked-out person just tried, or the one the
// code screen's "Change it" came back to correct (M24, M28). Never from the address bar.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  const flow = await flowOfThisRequest();
  const typed = flow?.purpose === 'reset' ? flow.email : await typedEmailOfThisRequest();
  return (
    <SignInScreen title="forgot.title" intro={t('forgot.intro')} search={search}>
      <form action={forgotPasswordAction}>
        <NextField next={next} />
        <EmailField value={typed} />
        <SubmitButton words="signUp.sendCode" />
      </form>
      <p>
        <a className="ui-button" data-kind="quiet" href={screenUrl('signin', { next })}>
          {t('forgot.backToSignIn')}
        </a>
      </p>
    </SignInScreen>
  );
}
