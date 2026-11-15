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

// The forgotten-password route (T-67): an emailed code, then a new password. It keeps
// the page to come back to (step 2.127), checked again by the flow (safeReturnPath), so
// after the new password the person is back where they started.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const next = safeReturnPath(search['next']);
  return (
    <SignInScreen title="forgot.title" intro={t('forgot.intro')} search={search}>
      <form action={forgotPasswordAction}>
        <NextField next={next} />
        <EmailField />
        <SubmitButton words="signUp.sendCode" />
      </form>
    </SignInScreen>
  );
}
