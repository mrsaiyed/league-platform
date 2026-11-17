import { leagueApiUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { HomePage } from '../../../features/schedule-pages/index.ts';
import type { LeagueRouteProps } from '../../../features/shell/index.ts';
import { startPageRedirect, YourTeamLine } from '../../../features/team-pages/index.ts';
import { loadLeaguePage } from '../../../server/load-league-page.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  const search = await searchParams;
  // The league's start page for members (U-5): its own team's page, when it has chosen that.
  const view = await loadLeaguePage(league, 'site');
  const to = await startPageRedirect(view, search);
  if (to !== undefined) return redirect(to);
  // "Your team" and the way to it, read after the page for this person or device alone
  // (step 2.168), so the home page is the same for everyone. A team is of the current
  // season, so a past season's home has none.
  const asked = search['season'];
  const yourTeam =
    asked === undefined || asked === '' ? (
      <YourTeamLine address={leagueApiUrl(view.context.league, ['my-team'])} />
    ) : null;
  return <HomePage league={league} search={search} yourTeam={yourTeam} />;
}
