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
import { isStaffAddress } from '../../features/staff/index.ts';
import { isTrackerAddress } from '../../features/tracker/index.ts';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { leagueSites, siteOf } from '../../server/league-site.ts';
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
  const routeLeague = (await params).league;
  const view = await leagueView(routeLeague, 'site');
  if (view === null) return children;
  const site = await siteOf(view.context.league, await leagueSites());
  const path = (await headers()).get(pathHeader) ?? '';
  const league = view.context.league;
  // The tracker has a frame of its own (step 2.35; docs/build/DESIGN.md section 7, line
  // 11): no public header, menu or footer, so one stray tap cannot leave a game, and
  // none of the league's design, which must never reach the scoring screen (record 064).
  // Its page draws the league's look itself where it only refuses (tracker-page.tsx).
  if (isTrackerAddress(league, path)) return children;
  // The admin has a frame of its own too (step 2.103; DESIGN.md section 4, line 20): for
  // someone the admin is open to, its layout draws the admin's own header and menu, and
  // the public site's header, tabs and footer are not shown at all. Anyone else at an
  // admin address is refused by the page, inside the league's frame as before.
  if (isStaffAddress(league, path) && (await leagueView(routeLeague, 'admin')) !== null) {
    return children;
  }
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
      <SiteFooter name={site.name} madeUp={(await webPorts()).madeUpWorld} />
    </div>
  );
}
