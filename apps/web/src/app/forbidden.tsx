import { t } from '../server/messages.ts';

/** U-6: the address shows where you asked to go; it never proves you may. Status 403. */
export default function Forbidden() {
  return (
    <main>
      <h1>{t('access.noAccess.title')}</h1>
      <p>{t('access.noAccess.body')}</p>
      <p>
        <a href="/signin">{t('nav.signIn')}</a>
      </p>
    </main>
  );
}
