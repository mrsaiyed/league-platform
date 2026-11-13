import { t } from '../server/messages.ts';

/**
 * A refusal stays bare on purpose (U-9): it must not reveal whether a league exists, so it
 * draws none of a league's own frame. U-8's mark (terms, privacy, "powered by") is carried
 * by every page of a league that may be shown, in the league layout, not here.
 */
export default function NotFound() {
  return (
    <main>
      <h1>{t('common.notFound')}</h1>
    </main>
  );
}
