import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';
import { TeamPage, type SearchProps } from '../../../../../features/teams-area/index.ts';

type TeamRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly team: string }>;
};

export default async function Page({ params, searchParams }: TeamRouteProps & SearchProps) {
  const { league, team } = await params;
  return <TeamPage league={league} teamId={team} query={await searchParams} />;
}
