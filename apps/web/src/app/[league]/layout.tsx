import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import {
  accountMenuOf,
  currentMenuPage,
  DesignStyle,
  headerSeason,
  LeagueNotice,
  signInHrefFrom,
  SiteFooter,
  SiteHeader,
  type LeagueRouteProps,
} from '../../features/shell/index.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { leagueSites, siteOfLeague } from '../../server/league-site.ts';
import { leagueView, signedInEmail } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { pathHeader } from '../../server/request-facts-header.ts';
import './league-site.css';

/**
 * Every page of one league. Each page refuses the league to those who may not see
 * it (U-9); this draws nothing of the league's own unless the page may be shown.
 * The league's design becomes CSS variables once here (T-90), and the header, menu
 * and footer with our small mark (U-8) frame every page. A page's body sits in the
 * centered column unless the page opens with a band the width of the screen and says so
 * on its main area (`site-wide`, league-site.css). The menu marks the page the
 * visitor is on, read from the address as it arrived (the proxy's header). On the menu's
 * pages the header also holds the season picker, so the seasons are read here; the page
 * under it reads the same ones without asking again (league-seasons.ts). The account button
 * (U-8) is the signed-in person's own, drawn for this request only (account-menu.ts); it is
 * on the admin's pages and the scoring page too, which sit under this layout.
 */
export default async function LeagueLayout({
  children,
  params,
}: LeagueRouteProps & { readonly children: ReactNode }) {
  const view = await leagueView((await params).league, 'site');
  if (view === null) return children;
  const site = siteOfLeague(view.context.league, leagueSites());
  const path = (await headers()).get(pathHeader) ?? '';
  const league = view.context.league;
  const current = currentMenuPage(league, path);
  const season =
    current === null ? null : headerSeason(league, path, await seasonsOfLeague(league.id));
  return (
    <div className="league-site ui-root">
      <DesignStyle design={site.design} />
      <a className="site-skip" href="#content">
        {t('shell.skipToContent')}
      </a>
      <SiteHeader
        league={league}
        name={site.name}
        account={accountMenuOf(view, await signedInEmail(), path)}
        signInHref={signInHrefFrom(path)}
        current={current}
        season={season}
      />
      <LeagueNotice status={view.context.league.status} />
      <div className="site-body" id="content">
        {children}
      </div>
      <SiteFooter name={site.name} />
    </div>
  );
}
