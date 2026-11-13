import {
  EmailField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { forgotPasswordAction } from '../../../../server/sign-in/actions.ts';

// The forgotten-password route (T-67): an emailed code, then a new password.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  return (
    <SignInScreen title="forgot.title" intro={t('forgot.intro')} search={search}>
      <form action={forgotPasswordAction}>
        <EmailField />
        <SubmitButton words="signUp.sendCode" />
      </form>
    </SignInScreen>
  );
}
