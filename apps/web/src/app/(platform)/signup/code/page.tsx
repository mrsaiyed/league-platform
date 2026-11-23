import { platformUrl } from '@srleagues/core';
import { cookies } from 'next/headers';
import {
  BotCheckField,
  SignInScreen,
  SubmitButton,
  type SearchProps,
} from '../../../../features/sign-in/index.ts';
import { t } from '../../../../server/messages.ts';
import { enterCodeAction, resendCodeAction } from '../../../../server/sign-in/actions.ts';
import { readFlow } from '../../../../server/sign-in/cookies.ts';
import { botCheckOnPage } from '../../../../server/sign-in/next-visit.ts';

// The 6-digit code from the email (T-67). "If that address can sign in, we have sent
// it a code", whether or not it can (T-68).
export default async function Page({ searchParams }: SearchProps) {
  const search = await searchParams;
  const jar = await cookies();
  const flow = readFlow({
    get: (name) => jar.get(name)?.value,
    set: () => undefined,
    delete: () => undefined,
  });
  const again = platformUrl(flow?.purpose === 'reset' ? 'forgotPassword' : 'signup');
  const botCheck = await botCheckOnPage();
  return (
    <SignInScreen
      title="code.title"
      intro={t('code.sent', { minutes: flow?.minutes ?? 10 })}
      search={search}
    >
      <form action={enterCodeAction}>
        <p>
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
      {flow === undefined ? (
        <p>
          <a className="ui-button" data-kind="quiet" href={again}>
            {t('code.again')}
          </a>
        </p>
      ) : (
        // A new code to the same address, behind the same check as the first (T4 §6).
        <form action={resendCodeAction}>
          <BotCheckField {...botCheck} action={flow.purpose} />
          <SubmitButton words="code.again" />
        </form>
      )}
    </SignInScreen>
  );
}
