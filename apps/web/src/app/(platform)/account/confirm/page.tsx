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

// The password again before a sensitive action (T-70). An account made with Google
// proves itself with a fresh Google sign-in instead.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  // Not on the test copy (step 2.205): an account made with Google holds a real address.
  const google = !(await webPorts()).testCopy;
  return (
    <SignInScreen title="confirm.title" intro={t('confirm.intro')} search={search}>
      <form action={confirmPasswordAction}>
        <NextField next={next} />
        <PasswordField />
        <SubmitButton words="confirm.submit" />
      </form>
      {google ? (
        <form action={googleAction}>
          <NextField next={next} />
          <SubmitButton words="confirm.google" />
        </form>
      ) : null}
    </SignInScreen>
  );
}
