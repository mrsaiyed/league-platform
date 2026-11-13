import { platformUrl } from '@srleagues/core';
import { t } from '../server/messages.ts';

/** Bare on purpose (U-9): no league frame, so it cannot leak a league's name or look; the mark (U-8) belongs to pages a league shows. U-6: the address shows where you asked to go; it never proves you may. Status 403. */
export default function Forbidden() {
  return (
    <main>
      <h1>{t('access.noAccess.title')}</h1>
      <p>{t('access.noAccess.body')}</p>
      <p>
        <a href={platformUrl('signin')}>{t('nav.signIn')}</a>
      </p>
    </main>
  );
}
