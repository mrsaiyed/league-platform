import type { ReactNode } from 'react';
import { LeagueNotice } from '../../features/shell/index.ts';
import { leagueView } from '../../server/load-league-page.ts';

/**
 * Every page of one league. Each page refuses the league to those who may not see
 * it (U-9); this draws nothing of the league's own unless the page may be shown.
 * The league's design, header, menu and footer come with step 1.18.
 */
export default async function LeagueLayout({ children }: { readonly children: ReactNode }) {
  const view = await leagueView('site');
  if (view === null) return children;
  return (
    <>
      <LeagueNotice status={view.context.league.status} />
      {children}
    </>
  );
}
