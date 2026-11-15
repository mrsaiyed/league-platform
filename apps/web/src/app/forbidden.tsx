import { platformUrl } from '@srleagues/core';
import { MessagePage } from '@srleagues/ui';
import { cookies } from 'next/headers';
import { StandalonePage } from '../features/shell/index.ts';
import { requestPath, signedInEmail } from '../server/load-league-page.ts';
import { t } from '../server/messages.ts';
import { signInFirstUrl } from '../server/sign-in-first.ts';

/**
 * No league frame on purpose (U-9), so it cannot leak a league's name or look; the mark (U-8) belongs to pages a league shows. U-6: the address shows where you asked to go; it never proves you may. Status 403.
 *
 * Someone signed in is told which account they are signed in as, with a way to switch to
 * another: signing in again on this device ends this session first, and brings them back
 * to the page they asked for (step 2.127). The rest of its words are step 2.157's.
 */
export default async function Forbidden() {
  // Next.js draws this screen into every page it sends, before it is known whether the
  // page refuses. Reading the session cookie first makes every page that carries it drawn
  // per request, never at build time or kept for others: this screen can name the person.
  await cookies();
  const email = await signedInEmail();
  if (email === null) {
    return (
      <StandalonePage>
        <MessagePage
          title={t('access.noAccess.title')}
          action={{ href: platformUrl('signin'), label: t('nav.signIn') }}
        >
          <p>{t('access.noAccess.body')}</p>
        </MessagePage>
      </StandalonePage>
    );
  }
  return (
    <StandalonePage>
      <MessagePage
        title={t('access.noAccess.title')}
        action={{ href: signInFirstUrl(await requestPath()), label: t('access.noAccess.switch') }}
      >
        <p>{t('access.noAccess.body')}</p>
        <p>{t('access.noAccess.signedInAs', { email })}</p>
      </MessagePage>
    </StandalonePage>
  );
}
