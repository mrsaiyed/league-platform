import { leagueUrl, platformUrl, type LeagueAddressee } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';
import { menuPages, type MenuPage } from './current-menu-page.ts';

const labels = {
  home: 'nav.home',
  schedule: 'nav.schedule',
  standings: 'nav.standings',
  stats: 'nav.stats',
  teams: 'nav.teams',
} as const;

/** The menu's links, with the page the visitor is on marked for everyone (aria-current). */
function MenuLinks({
  league,
  current,
}: {
  readonly league: LeagueAddressee;
  readonly current: MenuPage | null;
}) {
  return (
    <ul>
      {menuPages.map((page) => (
        <li key={page}>
          <a
            href={page === 'home' ? leagueHomeStayUrl(league) : leagueUrl(league, page)}
            aria-current={page === current ? 'page' : undefined}
          >
            {t(labels[page])}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The header stays at the top of every page of a league. First row: the league's name
 * (U-8), and sign-in for a visitor. Second row: the menu as tabs. On a phone the menu is
 * behind one button and opens as a panel: a plain disclosure, so it works with scripts
 * switched off. Only one of the two menus is ever drawn, whatever the width.
 */
export function SiteHeader({
  league,
  name,
  signedIn,
  current = null,
}: {
  readonly league: LeagueAddressee;
  readonly name: string;
  readonly signedIn: boolean;
  /** The page of the menu the visitor is on, if any. */
  readonly current?: MenuPage | null;
}) {
  return (
    <header className="site-header">
      <div className="site-column site-header-top">
        <a className="site-name" href={leagueHomeStayUrl(league)} dir="auto">
          {name}
        </a>
        {signedIn ? null : (
          <a className="site-sign-in" href={platformUrl('signin')}>
            {t('nav.signIn')}
          </a>
        )}
        <details className="site-menu">
          <summary>
            <span className="site-menu-icon" aria-hidden="true" />
            {t('nav.menu')}
          </summary>
          <nav className="site-menu-panel" aria-label={t('nav.menu')}>
            <MenuLinks league={league} current={current} />
          </nav>
        </details>
      </div>
      <nav className="site-tabs" aria-label={t('nav.menu')}>
        <div className="site-column">
          <MenuLinks league={league} current={current} />
        </div>
      </nav>
    </header>
  );
}
