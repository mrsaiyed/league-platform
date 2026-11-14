import { platformUrl } from '@srleagues/core';
import { MessagePage } from '@srleagues/ui';
import { StandalonePage } from '../features/shell/index.ts';
import { t } from '../server/messages.ts';

/** No league frame on purpose (U-9), so it cannot leak a league's name or look; the mark (U-8) belongs to pages a league shows. U-6: the address shows where you asked to go; it never proves you may. Status 403. */
export default function Forbidden() {
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
