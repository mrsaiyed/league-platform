import { redirect } from 'next/navigation';
import { HomePage } from '../../../features/schedule-pages/index.ts';
import type { LeagueRouteProps } from '../../../features/shell/index.ts';
import { startPageRedirect } from '../../../features/team-pages/index.ts';
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
  const to = await startPageRedirect(await loadLeaguePage(league, 'site'), search);
  if (to !== undefined) return redirect(to);
  return <HomePage league={league} search={search} />;
}
