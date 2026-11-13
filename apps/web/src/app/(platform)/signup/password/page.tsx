import {
  PasswordField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { choosePasswordAction } from '../../../../server/sign-in/actions.ts';

// Choose a password (T-85): at least 8 characters, leaked ones refused.
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  return (
    <SignInScreen title="password.title" intro={t('password.rules')} search={search}>
      <form action={choosePasswordAction}>
        <PasswordField fresh />
        <SubmitButton words="password.submit" />
      </form>
    </SignInScreen>
  );
}
