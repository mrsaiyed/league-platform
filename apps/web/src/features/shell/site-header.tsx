import { leagueUrl, platformUrl, type LeagueAddressee } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { Emblem, FilterToolbar, SeasonPicker } from '@srleagues/ui';
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
 * The header of every page of a league. First row: the league's mark (its first letter in
 * a shield, until it has a logo of its own) and its name (U-8), then the season picker on the pages that show one season, and the way in for a visitor.
 * Second row: the menu.
 *
 * On a phone the first row is the mark, the name and one menu button. The button opens a
 * panel in the header itself: the menu's links and sign-in, then the season picker. The
 * panel is a plain disclosure and the picker has its own button, so all of it works with
 * scripts switched off. The picker is in the page once, after the menu, and only one of
 * the two menus and one of the two sign-in links is ever drawn, whatever the width: so the
 * keyboard goes through the header in the order the eye does, on a phone and on a laptop.
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
        <div className="site-brand">
          <Emblem name={name} kind="league" />
          <a className="site-name" href={leagueHomeStayUrl(league)} dir="auto">
            <span>{name}</span>
          </a>
        </div>
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
      </div>
      <nav className="site-tabs" aria-label={t('nav.menu')}>
        <div className="site-column">
          <MenuLinks league={league} current={current} />
        </div>
      </nav>
    </header>
  );
}
