import { platformUrl } from '@srleagues/core';
import { MessagePage } from '@srleagues/ui';
import { StandalonePage } from '../features/shell/index.ts';
import { t } from '../server/messages.ts';

/**
 * A refusal draws none of a league's own frame on purpose (U-9): it must not reveal whether
 * a league exists, so it carries the neutral look and one way on, to our own start page.
 * U-8's mark (terms, privacy, "powered by") is carried by every page of a league that may
 * be shown, in the league layout, not here.
 */
export default function NotFound() {
  return (
    <StandalonePage>
      <MessagePage
        title={t('common.notFoundTitle')}
        action={{ href: platformUrl('home'), label: t('common.goToStart') }}
      >
        <p>{t('common.notFound')}</p>
      </MessagePage>
    </StandalonePage>
  );
}
