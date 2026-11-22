import {
  BotCheckField,
  EmailField,
  NextField,
  PasswordField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../features/sign-in/index.ts';
import { webPorts } from '../../../server/container.ts';
import { t } from '../../../server/messages.ts';
import { googleAction, signInAction } from '../../../server/sign-in/actions.ts';
import { safeReturnPath } from '../../../server/sign-in/device.ts';
import { botCheckOnPage } from '../../../server/sign-in/next-visit.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';
import { returnLeagueOf } from '../../../server/sign-in/return-league.ts';

// Email and password, or Google (R-2, T-67). The same screen whether or not the
// address has an account (T-68). Opened from a league's page, it names the league and
// leads back to that page (step 2.127); "Forgot your password?" keeps the page to come
// back to as well. A league this person may not see is not named (return-league.ts).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  // Not on the test copy (step 2.205): an account made with Google holds a real address.
  const google = !(await webPorts()).testCopy;
  const from = await returnLeagueOf(next);
  const botCheck = await botCheckOnPage();
  return (
    <SignInScreen
      title="page.signIn"
      intro={from === null ? undefined : t('signIn.fromLeague', { league: from.name })}
      search={search}
    >
      <form action={signInAction}>
        <NextField next={next} />
        <EmailField />
        <PasswordField />
        <BotCheckField {...botCheck} action="sign-in" />
        <SubmitButton words="signIn.submit" />
      </form>
      <p>
        <a className="ui-button" data-kind="quiet" href={screenUrl('forgotPassword', { next })}>
          {t('signIn.forgot')}
        </a>
      </p>
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
        <a className="ui-button" data-kind="quiet" href={screenUrl('signup', { next })}>
          {t('signIn.createAccount')}
        </a>
      </p>
      {from === null ? null : (
        <p>
          <a className="ui-button" data-kind="quiet" href={from.href}>
            {t('signIn.backTo', { league: from.name })}
          </a>
        </p>
      )}
    </SignInScreen>
  );
}
