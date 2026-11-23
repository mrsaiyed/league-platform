import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import {
  BotCheckField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { enterCodeAction, resendCodeAction } from '../../../../server/sign-in/actions.ts';
import { botCheckOnPage } from '../../../../server/sign-in/next-visit.ts';
import { noticeOf, screenUrl } from '../../../../server/sign-in/problems.ts';
import { flowOfThisRequest } from '../../../../server/sign-in/this-screen.ts';
import { signedInPerson } from '../../../../server/signed-in-leagues.ts';

// The 6-digit code from the email (T-67). Since step 2.163 (M24) it says where the code
// went, by the address typed, so a slip in it can be seen: "We sent a 6-digit code to …"
// on sign-up; "If … has an account, we sent it a code" on the forgotten-password route,
// whether or not it has (T-68). "Wrong address? Change it" goes back to the first screen
// with the address filled in; "Send a new code" sends one to the same address and comes
// back here saying so. The address comes from this device's own cookie, never the
// address bar. With nothing under way (an old tab, Back after the account was made) a
// signed-in person goes to their account; anyone else is told nothing is waiting for a
// code on this device, with a way to start again, and no word of a code sent (step 2.163's
// fix round). The code box stays; a code typed there is answered the same for every
// visitor (the first screen, "That code has run out"), naming no address (T-68).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const flow = await flowOfThisRequest();
  if (flow === undefined) {
    if ((await signedInPerson()).kind === 'signed-in') redirect(platformUrl('account'));
    return (
      <SignInScreen title="code.title" intro={t('code.nothingWaiting')} search={search}>
        <CodeForm />
        <p>
          <a className="ui-button" data-kind="quiet" href={platformUrl('signup')}>
            {t('code.startAgain')}
          </a>
        </p>
      </SignInScreen>
    );
  }
  // The code was right already (Back from the password screen): that screen, not this one again.
  if (flow.proof !== undefined) redirect(platformUrl('choosePassword'));
  const reset = flow.purpose === 'reset';
  const words = { email: flow.email, minutes: flow.minutes };
  const sentAgain = noticeOf(search) === 'codeSentAgain';
  const botCheck = await botCheckOnPage();
  return (
    <SignInScreen
      title="code.title"
      intro={sentAgain ? undefined : t(reset ? 'code.sentReset' : 'code.sentSignUp', words)}
      noticeWords={
        sentAgain ? t(reset ? 'code.sentAgainReset' : 'code.sentAgain', words) : undefined
      }
      search={search}
    >
      <p data-code-address="">
        {t('code.wrongAddress')}{' '}
        <a href={screenUrl(reset ? 'forgotPassword' : 'signup', { next: flow.next })}>
          {t('code.changeAddress')}
        </a>
      </p>
      <CodeForm />
      {/* A new code to the same address, behind the same check as the first (T4 §6). */}
      <form action={resendCodeAction}>
        <BotCheckField {...botCheck} action={flow.purpose} />
        <SubmitButton words="code.again" kind="second" />
      </form>
    </SignInScreen>
  );
}

/** The code's own box and button. */
function CodeForm() {
  return (
    <form action={enterCodeAction}>
      <p className="ui-field">
        <label>
          {t('code.label')}
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            required
          />
        </label>
      </p>
      <SubmitButton words="code.submit" />
    </form>
  );
}
