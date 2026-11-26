import { redirect } from 'next/navigation';
import {
  NextField,
  PasswordField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { webPorts } from '../../../../server/container.ts';
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
  // A name to give first (S-125), then back to this same action.
  if (person.kind === 'account-problem') {
    redirect(screenUrl('account', { next: screenUrl('confirmPassword', { next }) }));
  }
  if (person.kind === 'visitor') {
    redirect(screenUrl('signin', { next: screenUrl('confirmPassword', { next }) }));
  }
  // Drawn only where Google is set up (M27), and not on the test copy (step 2.205): an
  // account made with Google holds a real address.
  const google = googleSetUp() && !(await webPorts()).testCopy;
  return (
    <SignInScreen
      title="confirm.title"
      intro={t('confirm.intro')}
      search={search}
      google={google}
      fields={['password']}
    >
      <form action={confirmPasswordAction}>
        <NextField next={next} />
        <PasswordField search={search} />
        <SubmitButton words="confirm.submit" />
      </form>
      {google ? (
        <form action={googleAction}>
          <NextField next={next} />
          <SubmitButton words="confirm.google" kind="second" />
        </form>
      ) : null}
    </SignInScreen>
  );
}
