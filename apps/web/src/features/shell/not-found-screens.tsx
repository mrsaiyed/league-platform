import { platformUrl, type LeagueAddressee } from '@srleagues/core';
import { MessagePage } from '@srleagues/ui';
import { t } from '../../server/messages.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';
import { StandalonePage } from './standalone-page.tsx';

/**
 * "Not found" with none of a league's own frame (U-9): it must not reveal whether a league
 * exists, so it carries the neutral look and one way on, to our own start page. It is what
 * an address of no league gets, and what a league that may not be shown to this person gets:
 * the two are the same screen on purpose.
 */
export function PlatformNotFound() {
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

/**
 * "Not found" inside a league this person may see: a team, a season or a game that is not
 * there. The league layout has already drawn the league's header, menu and footer around
 * it, so this is only the message, with one way on: the league home.
 */
export function LeagueNotFound({ league }: { readonly league: LeagueAddressee }) {
  return (
    <MessagePage
      title={t('common.notFoundTitle')}
      action={{ href: leagueHomeStayUrl(league), label: t('shell.backToLeague') }}
    >
      <p>{t('common.notFound')}</p>
    </MessagePage>
  );
}
