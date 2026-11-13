import type { ReactNode } from 'react';
import {
  DesignStyle,
  LeagueNotice,
  SiteFooter,
  SiteHeader,
  type LeagueRouteProps,
} from '../../features/shell/index.ts';
import { siteOfLeague } from '../../server/league-site.ts';
import { leagueView } from '../../server/load-league-page.ts';
import './league-site.css';

/**
 * Every page of one league. Each page refuses the league to those who may not see
 * it (U-9); this draws nothing of the league's own unless the page may be shown.
 * The league's design becomes CSS variables once here (T-90), and the header, menu
 * and footer with our small mark (U-8) frame every page.
 */
export default async function LeagueLayout({
  children,
  params,
}: LeagueRouteProps & { readonly children: ReactNode }) {
  const view = await leagueView((await params).league, 'site');
  if (view === null) return children;
  const site = siteOfLeague(view.context.league);
  return (
    <div className="league-site">
      <DesignStyle design={site.design} />
      <SiteHeader
        league={view.context.league}
        name={site.name}
        signedIn={view.context.account !== null}
      />
      <LeagueNotice status={view.context.league.status} />
      <div className="site-body">{children}</div>
      <SiteFooter />
    </div>
  );
}
