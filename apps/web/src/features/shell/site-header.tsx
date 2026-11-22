import { leagueUrl, type LeagueAddressee } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { Emblem, FilterToolbar, SeasonPicker } from '@srleagues/ui';
import type { ReactNode } from 'react';
import { t } from '../../server/messages.ts';
import { signOutAction } from '../../server/sign-in/actions.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';
import { SignOutForm, SignOutLink } from '../tracker/index.ts';
import { waitingQuestionWords, type AccountMenu } from './account-menu.ts';
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
 * "My team" in the account menu (step 2.168), for someone with a team of the season; nothing
 * for anyone else.
 */
export function MyTeamEntry({ entry }: { readonly entry: AccountMenu['myTeam'] }) {
  if (entry === null) return null;
  return (
    <li>
      <a href={entry.href}>{t(entry.several ? 'account.menu.myTeams' : 'account.menu.myTeam')}</a>
    </li>
  );
}

/**
 * What the account button holds for a signed-in person (U-8): who they are signed in as,
 * then their team (step 2.168), the admin, their games, their account, and signing out. Drawn twice, as the menu
 * and sign-in are: in the phone menu's panel and in the account button of the first row;
 * only one of the two is shown at any width. Signing out also clears the games the tracker
 * kept on this device (T-115), so a shared tablet can be signed out from any page. On the
 * scoring page it leaves the open game first, as the tracker's own way out does: it asks
 * when plays are waiting to be sent, releases the scoring session, and with scripts off is
 * a link to the account page (tracker-sign-out.ts).
 */
function AccountEntries({
  account,
  myTeam,
}: {
  readonly account: AccountMenu;
  readonly myTeam?: ReactNode;
}) {
  return (
    <>
      <p className="site-account-who">{t('account.signedInAs', { email: account.email })}</p>
      <ul>
        {myTeam ?? <MyTeamEntry entry={account.myTeam} />}
        {account.adminHref === null ? null : (
          <li>
            <a href={account.adminHref}>{t('account.menu.admin')}</a>
          </li>
        )}
        {account.gamesHref === null ? null : (
          <li>
            <a href={account.gamesHref}>{t('account.menu.myGames')}</a>
          </li>
        )}
        <li>
          <a href={account.accountHref}>{t('account.menu.account')}</a>
        </li>
      </ul>
      {account.onScoringPage ? (
        <SignOutLink
          action={signOutAction}
          waitingQuestion={waitingQuestionWords()}
          href={account.accountHref}
          className="site-account-sign-out"
        >
          {t('account.signOut')}
        </SignOutLink>
      ) : (
        <SignOutForm action={signOutAction} waitingQuestion={waitingQuestionWords()}>
          <button className="site-account-sign-out" type="submit">
            {t('account.signOut')}
          </button>
        </SignOutForm>
      )}
    </>
  );
}

/**
 * The account button of a signed-in person: their initial, opening a small panel of their
 * account's entries. A plain disclosure, so it works with scripts switched off. In the
 * first row of a league's header, and in the scoring screen's own frame (step 2.35;
 * DESIGN.md section 7, line 11), which draws it in its own look.
 */
export function AccountButton({
  account,
  myTeam,
}: {
  readonly account: AccountMenu;
  /** "My team" drawn in place of the account's own (SiteHeader's `myTeam`). */
  readonly myTeam?: ReactNode;
}) {
  return (
    <details className="site-account" data-account="">
      <summary>
        <span className="site-account-initial" aria-hidden="true">
          {account.initial}
        </span>
        <span className="ui-visually-hidden">{t('account.menu')}</span>
      </summary>
      <nav className="site-account-panel" aria-label={t('account.menu')}>
        <AccountEntries account={account} myTeam={myTeam} />
      </nav>
    </details>
  );
}

/**
 * The header of every page of a league. First row: the league's mark (its first letter in
 * a shield, until it has a logo of its own) and its name (U-8), with nothing written under
 * it, then the season picker on the pages that show one season, and the account button: the
 * way in for a visitor, coming back to this page; for a signed-in person, their menu.
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
  account,
  signInHref,
  current = null,
  season = null,
  myTeam,
}: {
  readonly league: LeagueAddressee;
  readonly name: string;
  /** The signed-in person's account button (account-menu.ts), or null for a visitor. */
  readonly account: AccountMenu | null;
  /** Where signing in leads: the sign-in screen, coming back to this page. */
  readonly signInHref: string;
  /** The page of the menu the visitor is on, if any. */
  readonly current?: MenuPage | null;
  /** The season picker, on a page that has one (header-season.ts). */
  readonly season?: HeaderSeason | null;
  /**
   * "My team" drawn in place of the account's own (`account.myTeam`): the layout gives it as
   * a part that reads the person's teams itself, so the header is drawn without waiting for
   * that read and the page under it is served the same to everyone (step 2.168).
   */
  readonly myTeam?: ReactNode;
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
            {account === null ? (
              <a className="site-menu-sign-in" href={signInHref}>
                {t('account.signInOrCreate')}
              </a>
            ) : (
              <div className="site-menu-account">
                <AccountEntries account={account} myTeam={myTeam} />
              </div>
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
        {account === null ? (
          <a className="site-sign-in" href={signInHref}>
            {t('account.signInOrCreate')}
          </a>
        ) : (
          <AccountButton account={account} myTeam={myTeam} />
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
