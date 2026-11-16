import { leagueUrl } from '@srleagues/core';
import { MessagePage } from '@srleagues/ui';
import { cookies } from 'next/headers';
import { StandalonePage } from '../features/shell/index.ts';
import { isStaffAddress } from '../features/staff/index.ts';
import { requestPath, signedInEmail, staffViewOfAddress } from '../server/load-league-page.ts';
import { t } from '../server/messages.ts';
import { signInFirstUrl } from '../server/sign-in-first.ts';

/**
 * The admin's home, when the address refused is an area of an admin that is open to this
 * person (a scheduler at Teams): the refusal then leads back to it (step 2.103). Null for
 * anyone the admin is not open to, so nothing is said of a league to someone outside it.
 */
async function staffHomeOfRefusal(path: string): Promise<string | null> {
  try {
    const staff = await staffViewOfAddress();
    if (staff === null || !isStaffAddress(staff.context.league, path)) return null;
    return leagueUrl(staff.context.league, 'admin');
  } catch {
    return null;
  }
}

/**
 * No league frame on purpose (U-9), so it cannot leak a league's name or look; the mark (U-8) belongs to pages a league shows. U-6: the address shows where you asked to go; it never proves you may. Status 403.
 *
 * Someone signed in is told which account they are signed in as, with a way to switch to
 * another: signing in again on this device ends this session first, and brings them back
 * to the page they asked for (step 2.127). A visitor's "Sign in" brings them back to it too.
 * The session is read once per request, shared with the page (this-request.ts); if it
 * cannot be read the screen is a visitor's. The rest of its words are step 2.157's.
 *
 * Inside an admin that is open to the person (an area that is not theirs), the one clear
 * way on is "Back to the admin", and switching accounts is a second, quieter link.
 */
export default async function Forbidden() {
  // Next.js draws this screen into every page it sends, before it is known whether the
  // page refuses. Reading the session cookie first makes every page that carries it drawn
  // per request, never at build time or kept for others: this screen can name the person.
  await cookies();
  const email = await signedInEmail();
  const path = await requestPath();
  if (email === null) {
    return (
      <StandalonePage>
        <MessagePage
          title={t('access.noAccess.title')}
          action={{ href: signInFirstUrl(path), label: t('nav.signIn') }}
        >
          <p>{t('access.noAccess.body')}</p>
        </MessagePage>
      </StandalonePage>
    );
  }
  const staffHome = await staffHomeOfRefusal(path);
  if (staffHome !== null) {
    return (
      <StandalonePage>
        <MessagePage
          title={t('access.noAccess.title')}
          action={{ href: staffHome, label: t('admin.backToAdmin') }}
        >
          <p>{t('access.noAccess.body')}</p>
          <p>{t('access.noAccess.signedInAs', { email })}</p>
          <p>
            <a className="ui-button" data-kind="quiet" href={signInFirstUrl(path)}>
              {t('access.noAccess.switch')}
            </a>
          </p>
        </MessagePage>
      </StandalonePage>
    );
  }
  return (
    <StandalonePage>
      <MessagePage
        title={t('access.noAccess.title')}
        action={{ href: signInFirstUrl(path), label: t('access.noAccess.switch') }}
      >
        <p>{t('access.noAccess.body')}</p>
        <p>{t('access.noAccess.signedInAs', { email })}</p>
      </MessagePage>
    </StandalonePage>
  );
}
