import { leagueUrl, platformUrl, type LeagueAddressee } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { FilterToolbar, SeasonPicker } from '@srleagues/ui';
import { t } from '../../server/messages.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';
import { menuPages, type MenuPage } from './current-menu-page.ts';
import type { HeaderSeason } from './header-season.ts';

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
 * (U-8), the season picker on the pages that show one season, and sign-in for a visitor.
 * Second row: the menu as tabs. On a phone the first row is the name on one line, the
 * season and one menu button; the menu opens as a panel that also holds sign-in. The panel
 * is a plain disclosure, so it works with scripts switched off. Only one of the two menus,
 * and one of the two sign-in links, is ever drawn, whatever the width.
 */
export function SiteHeader({
  league,
  name,
  signedIn,
  current = null,
  season = null,
}: {
  readonly league: LeagueAddressee;
  readonly name: string;
  readonly signedIn: boolean;
  /** The page of the menu the visitor is on, if any. */
  readonly current?: MenuPage | null;
  /** The season picker, on a page that has one (header-season.ts). */
  readonly season?: HeaderSeason | null;
}) {
  const words = displayLabels(t);
  return (
    <header className="site-header">
      <div className="site-column site-header-top">
        <a className="site-name" href={leagueHomeStayUrl(league)} dir="auto">
          {name}
        </a>
        {season === null ? null : (
          <div className="site-season">
            <FilterToolbar label={words.filters}>
              <SeasonPicker
                id="site-season"
                label={words.season}
                submitLabel={words.show}
                action={season.action}
                value={season.value}
                options={season.options}
                keep={season.keep}
              />
            </FilterToolbar>
          </div>
        )}
        {signedIn ? null : (
          <a className="site-sign-in" href={platformUrl('signin')}>
            {t('nav.signIn')}
          </a>
        )}
        <details className="site-menu">
          <summary>
            <span className="site-menu-icon" aria-hidden="true" />
            <span className="ui-visually-hidden">{t('nav.menu')}</span>
          </summary>
          <nav className="site-menu-panel" aria-label={t('nav.menu')}>
            <MenuLinks league={league} current={current} />
            {signedIn ? null : (
              <a className="site-menu-sign-in" href={platformUrl('signin')}>
                {t('nav.signIn')}
              </a>
            )}
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
