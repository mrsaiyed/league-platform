import { MessagePage } from '@srleagues/ui';
import { t, type TextKey } from '../../server/messages.ts';

/**
 * A page whose address exists and whose screen comes in a later step: its title, one plain
 * sentence, and, where the page knows one, a way on.
 */
export function NotBuilt({
  title,
  className,
  backHref,
}: {
  readonly title: TextKey;
  readonly className?: string;
  /** Where "Back to the league home" goes, on a page of a league. */
  readonly backHref?: string;
}) {
  return (
    <MessagePage
      title={t(title)}
      className={className}
      action={
        backHref === undefined ? undefined : { href: backHref, label: t('shell.backToLeague') }
      }
    >
      <p>{t('shell.notBuilt')}</p>
    </MessagePage>
  );
}
