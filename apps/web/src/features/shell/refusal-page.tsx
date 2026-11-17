import { MessagePage } from '@srleagues/ui';
import { t } from '../../server/messages.ts';
import type { RefusalScreen } from './refusal-screen.ts';

const wayOn = (way: RefusalScreen['action']) => ({
  href: way.href,
  label: way.league === undefined ? t(way.label) : t(way.label, { league: way.league }),
});

/**
 * "You do not have access" as `screen` says it for the person looking (refusal-screen.ts):
 * centered, titled, its sentences, one clear way on and the quieter ones under it
 * (docs/build/DESIGN.md section 4, line 19). The frame around it is the caller's: the
 * admin's own for staff at an admin address, SR Leagues' plain one for everyone else.
 */
export function RefusalPage({ screen }: { readonly screen: RefusalScreen }) {
  return (
    <MessagePage
      title={t('access.noAccess.title')}
      action={wayOn(screen.action)}
      also={screen.also.map(wayOn)}
    >
      {screen.says.map((key) => (
        <p key={key}>{screen.email === null ? t(key) : t(key, { email: screen.email })}</p>
      ))}
    </MessagePage>
  );
}
