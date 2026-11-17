import { MessagePage } from '@srleagues/ui';
import { locale, t } from '../../server/messages.ts';
import type { RefusalScreen, Saying } from './refusal-screen.ts';

const wayOn = (way: RefusalScreen['action']) => ({
  href: way.href,
  label: way.league === undefined ? t(way.label) : t(way.label, { league: way.league }),
});

/** The person's own roles, each with its article, joined in the language's way. */
const rolesInWords = (roles: Saying['roles'] = []) =>
  new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    roles.map((role) => t(`access.noAccess.role.${role}`)),
  );

const sentence = (saying: Saying, email: string | null) =>
  t(saying.key, {
    ...(email === null ? {} : { email }),
    ...(saying.league === undefined ? {} : { league: saying.league }),
    ...(saying.roles === undefined ? {} : { roles: rolesInWords(saying.roles) }),
  });

/**
 * "You do not have access" as `screen` says it for the person looking (refusal-screen.ts):
 * centered, titled, its sentences, one clear way on and the quieter ones under it
 * (docs/build/DESIGN.md section 4, line 19). The frame around it is the caller's: the
 * admin's own for staff at an admin address, SR Leagues' plain one for everyone else.
 * The refusal screen wraps it in RefusalFresh (refusal-fresh.tsx).
 */
export function RefusalPage({ screen }: { readonly screen: RefusalScreen }) {
  return (
    <MessagePage
      title={t('access.noAccess.title')}
      action={wayOn(screen.action)}
      also={screen.also.map(wayOn)}
    >
      {screen.says.map((saying) => (
        <p key={saying.key}>{sentence(saying, screen.email)}</p>
      ))}
    </MessagePage>
  );
}
