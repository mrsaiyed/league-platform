import { leagueUrl, platformUrl, type LeagueAddressee } from '@srleagues/core';
import { t } from '../../server/messages.ts';

const menu = [
  ['home', 'nav.home'],
  ['schedule', 'nav.schedule'],
  ['standings', 'nav.standings'],
  ['stats', 'nav.stats'],
  ['teams', 'nav.teams'],
] as const;

/** The league's name leads (U-8), then its menu; the visitor can always sign in. */
export function SiteHeader({
  league,
  name,
  signedIn,
}: {
  readonly league: LeagueAddressee;
  readonly name: string;
  readonly signedIn: boolean;
}) {
  return (
    <header className="site-header">
      <a className="site-name" href={leagueUrl(league, 'home')} dir="auto">
        {name}
      </a>
      <nav aria-label={t('nav.menu')}>
        <ul>
          {menu.map(([page, label]) => (
            <li key={page}>
              <a href={leagueUrl(league, page)}>{t(label)}</a>
            </li>
          ))}
          {signedIn ? null : (
            <li>
              <a href={platformUrl('signin')}>{t('nav.signIn')}</a>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
