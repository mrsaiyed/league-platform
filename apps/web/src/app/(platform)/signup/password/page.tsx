import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import {
  PasswordField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { choosePasswordAction } from '../../../../server/sign-in/actions.ts';
import { screenUrl } from '../../../../server/sign-in/problems.ts';
import { flowOfThisRequest } from '../../../../server/sign-in/this-screen.ts';
import { signedInPerson } from '../../../../server/signed-in-leagues.ts';

// Choose a password (T-85): at least 8 characters, leaked ones refused. "Choose a new
// password" on the forgotten-password route (step 2.163). Only after a right code: with
// none (Back after the account was made, L10; an old tab) a signed-in person goes to
// their account, anyone else starts again, rather than being shown a form whose saving
// can only answer "That took too long". After a right code for an address that already
// has an account, it says that saving changes its password and signs out the account's
// other devices (R-31): a family sharing one address is not signed out unawares (M29).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const flow = await flowOfThisRequest();
  if (flow === undefined) {
    if ((await signedInPerson()).kind === 'signed-in') redirect(platformUrl('account'));
    redirect(screenUrl('signup', { problem: 'proofInvalid' }));
  }
  // A code is asked for but not yet entered: its screen first.
  if (flow.proof === undefined) redirect(platformUrl('enterCode'));
  return (
    <SignInScreen
      title={flow.purpose === 'reset' ? 'password.titleReset' : 'password.title'}
      intro={t('password.rules')}
      search={search}
      fields={['password']}
    >
      {flow.existing === true ? <p data-account-exists="">{t('password.existing')}</p> : null}
      <form action={choosePasswordAction}>
        <PasswordField fresh search={search} />
        <SubmitButton words="password.submit" />
      </form>
    </SignInScreen>
  );
}
