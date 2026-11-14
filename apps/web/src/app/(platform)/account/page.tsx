import { platformUrl } from '@srleagues/core';
import type { SessionSummary } from '@srleagues/providers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { webPorts } from '../../../server/container.ts';
import type { AccountProblem } from '../../../server/context.ts';
import { t, type TextKey } from '../../../server/messages.ts';
import { signOutAction, signOutEverywhereAction } from '../../../server/sign-in/actions.ts';
import { cookieNames } from '../../../server/sign-in/cookies.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';
import { timeInWords } from '../../../server/sign-in/sign-in-mail.ts';

// The account page (P6 §5): the devices signed in, by device and time, with "sign
// out" and "sign out everywhere" (T-71). Signed out, it sends the person to sign in.
// Signed in to a session that is none of our accounts' (record 055), it says so
// plainly and still offers to sign out; every league page sends such a person here.
export default async function Page() {
  // The cookies first: this makes the page drawn per request, never at build time.
  const accessToken = (await cookies()).get(cookieNames.session)?.value ?? '';
  const ports = await webPorts();
  const who = accessToken === '' ? undefined : await ports.identify(accessToken);
  if (who !== undefined && !who.ok && who.error.code === 'account-problem') {
    return <AccountProblemPage problem={who.error.problem} />;
  }
  if (who === undefined || !who.ok) {
    redirect(screenUrl('signin', { next: platformUrl('account') }));
  }
  const listed = await ports.signIn.listSessions({ accessToken });
  const sessions: readonly SessionSummary[] = listed.ok ? listed.value : [];
  return (
    <main>
      <h1>{t('page.account')}</h1>
      <h2>{t('account.devices')}</h2>
      <ul>
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <strong>{session.deviceLabel}</strong>
            {session.current ? <em> · {t('account.thisDevice')}</em> : null}
            <br />
            {t('account.signedInAt', { when: timeInWords(session.signedInAt) })}
            <br />
            {t('account.lastActive', { when: timeInWords(session.lastActiveAt) })}
          </li>
        ))}
      </ul>
      <form action={signOutAction}>
        <button type="submit">{t('account.signOut')}</button>
      </form>
      <form action={signOutEverywhereAction}>
        <p>{t('account.signOutEverywhereHelp')}</p>
        <button type="submit">{t('account.signOutEverywhere')}</button>
      </form>
    </main>
  );
}

const problemText = {
  'sign-in-link-conflict': 'account.problem.linkConflict',
  'address-not-confirmed': 'account.problem.notConfirmed',
} as const satisfies Record<AccountProblem, TextKey>;

/** What is wrong with the account, in plain words, and signing out (record 055). */
function AccountProblemPage({ problem }: { readonly problem: AccountProblem }) {
  return (
    <main>
      <h1>{t('account.problem.title')}</h1>
      <p>{t(problemText[problem])}</p>
      <form action={signOutAction}>
        <button type="submit">{t('account.signOut')}</button>
      </form>
    </main>
  );
}
