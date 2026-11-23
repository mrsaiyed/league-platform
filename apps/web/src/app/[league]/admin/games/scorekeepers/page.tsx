import { ScorekeepersPage } from '../../../../../features/scorekeepers-area/index.ts';
import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';

// The answer to a save never rides in the address (T-271, record 067): only the season.
export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  return <ScorekeepersPage league={league} search={await searchParams} />;
}
