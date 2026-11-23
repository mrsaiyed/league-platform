import { leagueApiUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { HomePage } from '../../../features/schedule-pages/index.ts';
import type { LeagueRouteProps } from '../../../features/shell/index.ts';
import { startPageRedirect, YourTeamLine } from '../../../features/team-pages/index.ts';
import { unreleasedScreen } from '../../../features/unreleased/index.ts';
import { loadLeaguePage } from '../../../server/load-league-page.ts';

/**
 * A league's home. One of our own pages not built yet (`/terms`, `/start`; step 2.140,
 * server/releases.ts) has no route of its own either, so its address, one word, comes here:
 * its placeholder is drawn only where pages not built yet are shown (local work and tests),
 * and anywhere else it is refused by the league's gate as a league that does not exist.
 */
export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  const unreleased = await unreleasedScreen([league]);
  if (unreleased !== null) return unreleased;
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
