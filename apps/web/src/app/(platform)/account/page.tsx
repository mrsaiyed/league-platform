import { platformUrl } from '@srleagues/core';
import type { SessionSummary } from '@srleagues/providers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignOutForm } from '../../../features/tracker/index.ts';
import { webPorts } from '../../../server/container.ts';
import { t } from '../../../server/messages.ts';
import { signOutAction, signOutEverywhereAction } from '../../../server/sign-in/actions.ts';
import { cookieNames } from '../../../server/sign-in/cookies.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';
import { timeInWords } from '../../../server/sign-in/sign-in-mail.ts';

// The account page (P6 §5): the devices signed in, by device and time, with "sign
// out" and "sign out everywhere" (T-71). Signed out, it sends the person to sign in.
// Either one also clears the games the tracker kept on this device (T-115).
export default async function Page() {
  // The cookies first: this makes the page drawn per request, never at build time.
  const accessToken = (await cookies()).get(cookieNames.session)?.value ?? '';
  const ports = await webPorts();
  const who = accessToken === '' ? undefined : await ports.identify(accessToken);
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
      <SignOutForm action={signOutAction}>
        <button type="submit">{t('account.signOut')}</button>
      </SignOutForm>
      <SignOutForm action={signOutEverywhereAction}>
        <p>{t('account.signOutEverywhereHelp')}</p>
        <button type="submit">{t('account.signOutEverywhere')}</button>
      </SignOutForm>
    </main>
  );
}
