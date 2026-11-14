import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';
import { TeamPage } from '../../../../../features/team-pages/index.ts';

export default async function Page({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly league: string; readonly team: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league, team } = await params;
  return <TeamPage league={league} team={team} search={await searchParams} />;
}
