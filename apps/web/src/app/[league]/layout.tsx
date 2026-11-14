import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import {
  currentMenuPage,
  DesignStyle,
  LeagueNotice,
  SiteFooter,
  SiteHeader,
  type LeagueRouteProps,
} from '../../features/shell/index.ts';
import { siteOfLeague } from '../../server/league-site.ts';
import { leagueView } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { pathHeader } from '../../server/request-facts-header.ts';
import './league-site.css';

/**
 * Every page of one league. Each page refuses the league to those who may not see
 * it (U-9); this draws nothing of the league's own unless the page may be shown.
 * The league's design becomes CSS variables once here (T-90), and the header, menu
 * and footer with our small mark (U-8) frame every page. The menu marks the page the
 * visitor is on, read from the address as it arrived (the proxy's header).
 */
export default async function LeagueLayout({
  children,
  params,
}: LeagueRouteProps & { readonly children: ReactNode }) {
  const view = await leagueView((await params).league, 'site');
  if (view === null) return children;
  const site = siteOfLeague(view.context.league);
  const path = (await headers()).get(pathHeader) ?? '';
  return (
    <div className="league-site ui-root">
      <DesignStyle design={site.design} />
      <a className="site-skip" href="#content">
        {t('shell.skipToContent')}
      </a>
      <SiteHeader
        league={view.context.league}
        name={site.name}
        signedIn={view.context.account !== null}
        current={currentMenuPage(view.context.league, path)}
      />
      <LeagueNotice status={view.context.league.status} />
      <div className="site-body site-column" id="content">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
